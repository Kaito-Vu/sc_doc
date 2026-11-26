import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyRepo } from './api-key.repo';
import { TokenService } from '../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { JwtApiKeyPayload } from '../../core/auth/dto/jwt-payload';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { isUserDisabled } from '../../common/helpers';

export const NO_EXPIRY_SECONDS = 100 * 365 * 24 * 3600;

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(
    workspaceId: string,
    userId: string,
    pagination: PaginationOptions,
    adminView?: boolean,
  ) {
    return this.apiKeyRepo.listPaginated(workspaceId, pagination, {
      creatorId: adminView ? undefined : userId,
    });
  }

  async create(
    workspaceId: string,
    user: User,
    data: { name: string; expiresAt?: string; scopes?: string[] },
  ) {
    const expiresAt = this.parseExpiry(data.expiresAt);

    const apiKey = await this.apiKeyRepo.insert({
      name: data.name,
      creatorId: user.id,
      workspaceId,
      expiresAt,
      // jsonb column: stringify, or pg would send a Postgres array literal
      ...(data.scopes && { scopes: JSON.stringify(data.scopes) }),
    });

    // The JWT carries the same expiry as the DB row (defense in depth: the
    // token dies on its own even if the DB check were ever bypassed).
    // No expiry: generateApiToken refuses a missing lifetime, so use 100 years.
    // Revoking the key (soft delete) still kills it, validateApiKey checks the row.
    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKey.id,
      user,
      workspaceId,
      expiresIn: expiresAt
        ? Math.ceil((expiresAt.getTime() - Date.now()) / 1000)
        : NO_EXPIRY_SECONDS,
    });

    this.auditService.log({
      event: AuditEvent.API_KEY_CREATED,
      resourceType: AuditResource.API_KEY,
      resourceId: apiKey.id,
      metadata: { name: data.name },
    });

    const withCreator = await this.apiKeyRepo.findById(apiKey.id, workspaceId, {
      includeCreator: true,
    });

    return { ...withCreator, token };
  }

  private parseExpiry(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be a valid future date');
    }
    return date;
  }

  async update(
    workspaceId: string,
    userId: string,
    data: { apiKeyId: string; name: string },
    isAdmin: boolean,
  ) {
    const existing = await this.apiKeyRepo.findById(data.apiKeyId, workspaceId);
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    if (!isAdmin && existing.creatorId !== userId) {
      throw new ForbiddenException();
    }

    const updated = await this.apiKeyRepo.update(data.apiKeyId, workspaceId, {
      name: data.name,
    });

    this.auditService.log({
      event: AuditEvent.API_KEY_UPDATED,
      resourceType: AuditResource.API_KEY,
      resourceId: data.apiKeyId,
      changes: { after: { name: data.name } },
    });

    return this.apiKeyRepo.findById(updated.id, workspaceId, {
      includeCreator: true,
    });
  }

  async revoke(
    workspaceId: string,
    userId: string,
    apiKeyId: string,
    isAdmin: boolean,
  ) {
    const existing = await this.apiKeyRepo.findById(apiKeyId, workspaceId);
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    if (!isAdmin && existing.creatorId !== userId) {
      throw new ForbiddenException();
    }

    await this.apiKeyRepo.softDelete(apiKeyId, workspaceId);

    this.auditService.log({
      event: AuditEvent.API_KEY_DELETED,
      resourceType: AuditResource.API_KEY,
      resourceId: apiKeyId,
    });
  }

  async validateApiKey(payload: JwtApiKeyPayload) {
    // three independent reads in parallel (was 3 sequential round trips)
    const [apiKey, workspace, user] = await Promise.all([
      this.apiKeyRepo.findById(payload.apiKeyId, payload.workspaceId),
      this.workspaceRepo.findById(payload.workspaceId),
      this.userRepo.findById(payload.sub, payload.workspaceId),
    ]);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
      throw new UnauthorizedException('API key expired');
    }

    if (!workspace) {
      throw new UnauthorizedException();
    }

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    // best-effort bookkeeping: keep it off the request's critical path
    this.apiKeyRepo.touchLastUsed(apiKey.id).catch(() => undefined);

    // JwtAuthGuard enforces read-only keys from `apiKey.scopes`
    return { user, workspace, apiKey: { id: apiKey.id, scopes: apiKey.scopes } };
  }
}
