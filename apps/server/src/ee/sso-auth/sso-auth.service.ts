import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { InjectKysely } from 'nestjs-kysely';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { SsoService } from '../sso/sso.service';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { MfaGateService, MfaGateResult } from '../mfa/services/mfa-gate.service';
import { AuthProvider, Workspace } from '@docmost/db/types/entity.types';
import { Client } from 'ldapts';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { SsoIdentityResolver } from './sso-identity-resolver';
import { buildLdapUserFilter, firstLdapValue } from './ldap.util';

const LDAP_TIMEOUT_MS = 10_000;
const LDAP_CONNECT_TIMEOUT_MS = 5_000;

@Injectable()
export class SsoAuthService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly ssoService: SsoService,
    private readonly identityResolver: SsoIdentityResolver,
    private readonly mfaGateService: MfaGateService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectKysely() private readonly db: KyselyDB,
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
    // Defense in depth on top of the DTO: an empty password would make many
    // LDAP servers accept an unauthenticated bind as a successful login.
    if (!data.username || !data.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const entry = await this.authenticate(provider, data);

    const email =
      firstLdapValue(entry.mail) ||
      `${firstLdapValue(entry.uid) ?? data.username}@${workspaceId}.ldap.local`;
    const name = firstLdapValue(entry.cn) || data.username;

    const user = await executeTx(this.db, (trx) =>
      this.identityResolver.resolve(
        { email, name, providerUserId: entry.dn, provider, workspaceId },
        trx,
      ),
    );

    return this.mfaGateService.checkAndChallenge(user, workspace, res, {
      method: 'ldap',
      providerId: provider.id,
      providerName: provider.name,
    });
  }

  /** Finds the user's entry with the service account, then binds as them. */
  private async authenticate(
    provider: AuthProvider,
    data: { username: string; password: string },
  ) {
    const client = this.createClient(provider);
    try {
      if (provider.ldapTlsEnabled && provider.ldapUrl.startsWith('ldap://')) {
        await client.startTLS(this.tlsOptions(provider) ?? {});
      }
      if (provider.ldapBindDn && provider.ldapBindPassword) {
        await client.bind(
          provider.ldapBindDn,
          this.ssoService.decryptSecret(provider.ldapBindPassword),
        );
      }
      const { searchEntries } = await client.search(provider.ldapBaseDn, {
        scope: 'sub',
        filter: buildLdapUserFilter(
          provider.ldapUserSearchFilter,
          data.username,
        ),
        attributes: ['mail', 'cn', 'uid'],
      });
      // An ambiguous filter must not let the first match win.
      if (searchEntries.length !== 1) {
        this.logFailure(provider, data.username, 'user_not_found');
        throw new UnauthorizedException('Invalid credentials');
      }
      const entry = searchEntries[0];

      try {
        await client.bind(entry.dn, data.password);
      } catch {
        this.logFailure(provider, data.username, 'bind_failed');
        throw new UnauthorizedException('Invalid credentials');
      }
      return entry;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private createClient(provider: AuthProvider): Client {
    return new Client({
      url: provider.ldapUrl,
      timeout: LDAP_TIMEOUT_MS,
      connectTimeout: LDAP_CONNECT_TIMEOUT_MS,
      tlsOptions: this.tlsOptions(provider),
    });
  }

  private tlsOptions(provider: AuthProvider) {
    return provider.ldapTlsCaCert ? { ca: [provider.ldapTlsCaCert] } : undefined;
  }

  private logFailure(
    provider: AuthProvider,
    username: string,
    failureReason: 'user_not_found' | 'bind_failed',
  ) {
    this.auditService.log({
      event: AuditEvent.USER_LOGIN_FAILED,
      resourceType: AuditResource.USER,
      metadata: {
        method: 'ldap',
        providerId: provider.id,
        providerName: provider.name,
        failureReason,
        attemptedEmail: username,
      },
    });
  }
}
