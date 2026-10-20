import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuditQueryService } from './audit-query.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import {
  AuditLogDetailDto,
  AuditQueryDto,
  UpdateAuditRetentionDto,
} from './dto/audit-query.dto';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditQueryController {
  constructor(
    private readonly auditQueryService: AuditQueryService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertOwner(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  @RequireFeature(Feature.AUDIT_LOGS)
  async query(
    @Body() body: AuditQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);
    return this.auditQueryService.queryLogs(workspace.id, body, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('stats')
  @RequireFeature(Feature.AUDIT_LOGS)
  async stats(
    @Body() body: AuditQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);
    return this.auditQueryService.getStats(workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('facets')
  @RequireFeature(Feature.AUDIT_LOGS)
  async facets(
    @Body() body: AuditQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);
    return this.auditQueryService.getFacets(workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('detail')
  @RequireFeature(Feature.AUDIT_LOGS)
  async detail(
    @Body() body: AuditLogDetailDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);
    const log = await this.auditQueryService.getDetail(workspace.id, body.id);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }
    return log;
  }

  @HttpCode(HttpStatus.OK)
  @Post('export')
  @RequireFeature(Feature.AUDIT_LOGS)
  @SkipTransform()
  async export(
    @Body() body: AuditQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.assertOwner(user, workspace);

    const { csv, rowCount } = await this.auditQueryService.exportCsv(
      workspace.id,
      body,
    );

    this.auditService.log({
      event: AuditEvent.AUDIT_EXPORTED,
      resourceType: AuditResource.AUDIT_LOG,
      resourceId: workspace.id,
      metadata: {
        rowCount,
        filters: this.describeFilters(body),
      },
    });

    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);

    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention')
  @RequireFeature(Feature.AUDIT_LOGS)
  async getRetention(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);
    return this.auditQueryService.getRetention(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention/update')
  @RequireFeature(Feature.AUDIT_LOGS)
  async updateRetention(
    @Body() body: UpdateAuditRetentionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertOwner(user, workspace);

    const before = await this.auditQueryService.getRetention(workspace.id);
    const result = await this.auditQueryService.updateRetention(
      workspace.id,
      body.auditRetentionDays,
    );

    this.auditService.log({
      event: AuditEvent.AUDIT_RETENTION_UPDATED,
      resourceType: AuditResource.WORKSPACE,
      resourceId: workspace.id,
      changes: {
        before: { retentionDays: before.retentionDays },
        after: { retentionDays: result.retentionDays },
      },
    });

    return result;
  }

  private describeFilters(body: AuditQueryDto) {
    return {
      event: body.event ?? null,
      events: body.events ?? null,
      search: body.search ?? null,
      resourceType: body.resourceType ?? null,
      resourceId: body.resourceId ?? null,
      actorId: body.actorId ?? null,
      actorTypes: body.actorTypes ?? null,
      spaceId: body.spaceId ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      ipAddress: body.ipAddress ?? null,
    };
  }
}
