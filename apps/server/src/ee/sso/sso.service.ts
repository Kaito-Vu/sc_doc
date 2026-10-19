import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { InjectKysely } from 'nestjs-kysely';
import { AuthProviderRepo } from './auth-provider.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { User } from '@docmost/db/types/entity.types';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { Workspace } from '@docmost/db/types/entity.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { EnvironmentService } from '../../integrations/environment/environment.service';

const SECRET_ENC_PREFIX = 'enc:';
const SECRET_MASK = '********';
const PROVIDER_TYPES = ['oidc', 'saml', 'ldap', 'google'];

@Injectable()
export class SsoService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /**
   * Providers actually linked to at least one member — used to populate the
   * provider filter on the workspace Members list (ee/sso owns this so core
   * never needs to know about auth_providers).
   */
  async listMemberAuthProviders(
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db
      .selectFrom('authProviders')
      .select(['id', 'name'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('authAccounts')
            .select('authAccounts.id')
            .whereRef('authAccounts.authProviderId', '=', 'authProviders.id')
            .where('authAccounts.deletedAt', 'is', null),
        ),
      )
      .orderBy('name', 'asc')
      .execute();
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  private getSecretEncryptionKey(): Buffer {
    return createHash('sha256')
      .update(this.environmentService.getAppSecret())
      .digest();
  }

  encryptSecret(plain: string): string {
    const key = this.getSecretEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return (
      SECRET_ENC_PREFIX +
      Buffer.concat([iv, tag, ciphertext]).toString('base64')
    );
  }

  decryptSecret(value: string): string {
    if (!value.startsWith(SECRET_ENC_PREFIX)) {
      // Tương thích ngược với secret đã lưu plaintext trước khi bật mã hoá.
      return value;
    }
    const raw = Buffer.from(value.slice(SECRET_ENC_PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const key = this.getSecretEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private isEntraIdFlavor(settings: any): boolean {
    return settings?.oidc?.provider === 'azuread';
  }

  private buildEntraIssuer(tenantId: string): string {
    return `https://login.microsoftonline.com/${tenantId}/v2.0`;
  }

  /** Never returns stored secrets, only whether one is set. */
  private mapProvider(provider: any) {
    return {
      ...provider,
      providerId: provider.id,
      oidcClientSecret: provider.oidcClientSecret ? SECRET_MASK : null,
      ldapBindPassword: provider.ldapBindPassword ? SECRET_MASK : null,
    };
  }

  /**
   * Encrypts a newly submitted secret; `undefined` (= keep the stored one)
   * for an empty value or the mask echoed back by the client.
   */
  private encryptSubmittedSecret(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value || value === SECRET_MASK) {
      return undefined;
    }
    return this.encryptSecret(value);
  }

  async list(
    workspaceId: string,
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
  ) {
    this.assertAdmin(user, workspace);
    const result = await this.authProviderRepo.listPaginated(
      workspaceId,
      pagination,
    );
    return {
      ...result,
      items: result.items.map((p) => this.mapProvider(p)),
    };
  }

  async getById(
    providerId: string,
    workspaceId: string,
    user: User,
    workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    const provider = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!provider) {
      throw new NotFoundException('SSO provider not found');
    }
    return this.mapProvider(provider);
  }

  async create(workspaceId: string, user: User, workspace: Workspace, data: any) {
    this.assertAdmin(user, workspace);
    if (!PROVIDER_TYPES.includes(data.type)) {
      throw new BadRequestException('Invalid SSO provider type');
    }

    const settings = data.settings ?? null;
    let oidcIssuer = data.oidcIssuer ?? null;
    if (this.isEntraIdFlavor(settings)) {
      if (!data.oidcTenantId) {
        throw new BadRequestException(
          'Tenant ID is required for Microsoft Entra ID',
        );
      }
      oidcIssuer = this.buildEntraIssuer(data.oidcTenantId);
    }

    const provider = await this.authProviderRepo.insert({
      name: data.name,
      type: data.type,
      samlUrl: data.samlUrl ?? null,
      samlCertificate: data.samlCertificate ?? null,
      oidcIssuer,
      oidcClientId: data.oidcClientId ?? null,
      oidcClientSecret: this.encryptSubmittedSecret(data.oidcClientSecret) ?? null,
      oidcTenantId: data.oidcTenantId ?? null,
      settings,
      ldapUrl: data.ldapUrl ?? null,
      ldapBindDn: data.ldapBindDn ?? null,
      ldapBindPassword: this.encryptSubmittedSecret(data.ldapBindPassword) ?? null,
      ldapBaseDn: data.ldapBaseDn ?? null,
      ldapUserSearchFilter: data.ldapUserSearchFilter ?? null,
      ldapUserAttributes: data.ldapUserAttributes ?? null,
      ldapTlsEnabled: data.ldapTlsEnabled ?? false,
      ldapTlsCaCert: data.ldapTlsCaCert ?? null,
      allowSignup: data.allowSignup ?? false,
      isEnabled: data.isEnabled ?? false,
      groupSync: data.groupSync ?? false,
      creatorId: user.id,
      workspaceId,
    });

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_CREATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: provider.id,
      metadata: { type: provider.type, name: provider.name },
    });

    return this.mapProvider(provider);
  }

  async update(
    workspaceId: string,
    user: User,
    workspace: Workspace,
    data: any,
  ) {
    this.assertAdmin(user, workspace);
    const providerId = data.providerId ?? data.id;
    const existing = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }

    const settings = data.settings !== undefined ? data.settings : existing.settings;
    const tenantId =
      data.oidcTenantId !== undefined ? data.oidcTenantId : existing.oidcTenantId;

    let oidcIssuer = data.oidcIssuer;
    if (this.isEntraIdFlavor(settings)) {
      if (!tenantId) {
        throw new BadRequestException(
          'Tenant ID is required for Microsoft Entra ID',
        );
      }
      oidcIssuer = this.buildEntraIssuer(tenantId);
    }

    const updated = await this.authProviderRepo.update(
      providerId,
      workspaceId,
      {
        name: data.name,
        samlUrl: data.samlUrl,
        samlCertificate: data.samlCertificate,
        oidcIssuer,
        oidcClientId: data.oidcClientId,
        oidcClientSecret: this.encryptSubmittedSecret(data.oidcClientSecret),
        oidcTenantId: data.oidcTenantId,
        settings,
        ldapUrl: data.ldapUrl,
        ldapBindDn: data.ldapBindDn,
        ldapBindPassword: this.encryptSubmittedSecret(data.ldapBindPassword),
        ldapBaseDn: data.ldapBaseDn,
        ldapUserSearchFilter: data.ldapUserSearchFilter,
        ldapUserAttributes: data.ldapUserAttributes,
        ldapTlsEnabled: data.ldapTlsEnabled,
        ldapTlsCaCert: data.ldapTlsCaCert,
        allowSignup: data.allowSignup,
        isEnabled: data.isEnabled,
        groupSync: data.groupSync,
      },
    );

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_UPDATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: updated.id,
      metadata: { type: updated.type, name: updated.name, updatedBy: user.id },
    });

    return this.mapProvider(updated);
  }

  async delete(
    providerId: string,
    workspaceId: string,
    user: User,
    workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    const existing = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!existing) {
      throw new NotFoundException('SSO provider not found');
    }
    await this.authProviderRepo.softDelete(providerId, workspaceId);

    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_DELETED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: existing.id,
      metadata: { deletedBy: user.id, type: existing.type, name: existing.name },
    });
  }
}
