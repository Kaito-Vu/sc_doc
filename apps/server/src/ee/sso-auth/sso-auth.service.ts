import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { MfaGateService, MfaGateResult } from '../mfa/services/mfa-gate.service';
import { Workspace } from '@docmost/db/types/entity.types';
import { Client } from 'ldapts';
import { UserRole } from '../../common/helpers/types/permission';
import { nanoIdGen } from '../../common/helpers';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

@Injectable()
export class SsoAuthService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly userRepo: UserRepo,
    private readonly mfaGateService: MfaGateService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async ldapLogin(
    providerId: string,
    data: { username: string; password: string },
    workspace: Workspace,
    res: FastifyReply,
  ): Promise<MfaGateResult> {
    const workspaceId = workspace.id;
    const provider = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!provider || provider.type !== 'ldap' || !provider.isEnabled) {
      throw new NotFoundException('LDAP provider not found');
    }
    if (!provider.ldapUrl || !provider.ldapBaseDn) {
      throw new BadRequestException('LDAP provider is not configured');
    }

    const client = new Client({ url: provider.ldapUrl });
    try {
      if (provider.ldapBindDn && provider.ldapBindPassword) {
        await client.bind(provider.ldapBindDn, provider.ldapBindPassword);
      }
      const filter =
        provider.ldapUserSearchFilter?.replace('{{username}}', data.username) ||
        `(uid=${data.username})`;
      const { searchEntries } = await client.search(provider.ldapBaseDn, {
        scope: 'sub',
        filter,
        attributes: ['mail', 'cn', 'uid'],
      });
      if (!searchEntries.length) {
        this.auditService.log({
          event: AuditEvent.USER_LOGIN_FAILED,
          resourceType: AuditResource.USER,
          metadata: {
            method: 'ldap',
            providerId: provider.id,
            providerName: provider.name,
            failureReason: 'user_not_found',
            attemptedEmail: data.username,
          },
        });
        throw new UnauthorizedException('Invalid credentials');
      }
      const entry = searchEntries[0];

      try {
        await client.bind(entry.dn, data.password);
      } catch (error) {
        this.auditService.log({
          event: AuditEvent.USER_LOGIN_FAILED,
          resourceType: AuditResource.USER,
          metadata: {
            method: 'ldap',
            providerId: provider.id,
            providerName: provider.name,
            failureReason: 'bind_failed',
            attemptedEmail: data.username,
          },
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      const email =
        (entry.mail as string) ||
        `${data.username}@${workspaceId}.ldap.local`;
      let user = await this.userRepo.findByEmail(email, workspaceId);
      if (!user && provider.allowSignup) {
        user = await this.userRepo.insertUser({
          email,
          name: (entry.cn as string) || data.username,
          password: nanoIdGen(16),
          workspaceId,
          role: UserRole.MEMBER,
        });
      }
      if (!user) {
        throw new UnauthorizedException('User not provisioned');
      }

      return this.mfaGateService.checkAndChallenge(user, workspace, res, {
        method: 'ldap',
        providerId: provider.id,
        providerName: provider.name,
      });
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
