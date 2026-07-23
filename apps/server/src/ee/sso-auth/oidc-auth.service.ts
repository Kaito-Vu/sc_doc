import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as client from 'openid-client';
import { InjectKysely } from 'nestjs-kysely';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User } from '@docmost/db/types/entity.types';
import { SessionService } from '../../core/session/session.service';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { encodeOidcState, decodeOidcState } from './oidc-state.util';
import { UserRole } from '../../common/helpers/types/permission';
import { nanoIdGen } from '../../common/helpers';

const AZURE_GRAPH_SCOPE = 'https://graph.microsoft.com/User.Read';
const AZURE_GRAPH_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photo/$value';

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    private readonly userRepo: UserRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly sessionService: SessionService,
    private readonly workspaceService: WorkspaceService,
    private readonly attachmentService: AttachmentService,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private buildCallbackUrl(providerId?: string): string {
    const base = `${this.environmentService.getAppUrl()}/api/sso/oidc`;
    return providerId ? `${base}/${providerId}/callback` : `${base}/callback`;
  }

  private isOidcCapable(provider: { type: string } | undefined): boolean {
    return provider?.type === 'oidc' || provider?.type === 'azure-ad';
  }

  private isAzureProvider(provider: { type: string } | undefined): boolean {
    return provider?.type === 'azure-ad';
  }

  /**
   * Tolerates the two most common admin mistakes when pasting an Entra ID
   * issuer: pasting the ADFS/Entra federation metadata URL instead of the
   * OIDC issuer, or pasting the full `.well-known/openid-configuration`
   * discovery URL instead of its base. Both are normalized to the issuer
   * base URL `client.discovery()` expects.
   */
  private normalizeIssuerUrl(rawIssuer: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawIssuer.trim());
    } catch {
      throw new BadRequestException(
        'Invalid OIDC issuer URL. Expected an issuer base URL such as https://login.microsoftonline.com/<tenant>/v2.0',
      );
    }

    const federationTenant = this.extractAzureFederationTenant(parsed);
    if (federationTenant) {
      return new URL(
        `https://login.microsoftonline.com/${encodeURIComponent(federationTenant)}/v2.0`,
      );
    }
    if (parsed.pathname.toLowerCase().includes('/federationmetadata/')) {
      throw new BadRequestException(
        'Azure federation metadata URL is not a valid OIDC issuer. Use an issuer base URL such as https://login.microsoftonline.com/<tenant>/v2.0',
      );
    }

    const wellKnownSuffix = '/.well-known/openid-configuration';
    if (parsed.pathname.toLowerCase().endsWith(wellKnownSuffix)) {
      parsed.pathname = parsed.pathname.slice(0, -wellKnownSuffix.length) || '/';
    }

    return parsed;
  }

  private extractAzureFederationTenant(url: URL): string | null {
    if (!url.pathname.toLowerCase().includes('/federationmetadata/')) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (
      host !== 'login.microsoftonline.com' &&
      host !== 'login.windows.net' &&
      host !== 'sts.windows.net'
    ) {
      return null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[0] || null;
  }

  private async discover(
    provider: { oidcIssuer: string; oidcClientId: string; oidcClientSecret: string },
  ) {
    const issuerUrl = this.normalizeIssuerUrl(provider.oidcIssuer);
    try {
      return await client.discovery(
        issuerUrl,
        provider.oidcClientId,
        provider.oidcClientSecret,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OIDC discovery failed for issuer=${issuerUrl.toString()}: ${message}`,
      );
      throw new BadRequestException(
        `OIDC discovery failed for issuer ${issuerUrl.toString()}. Verify the issuer is the OIDC issuer base URL (e.g. https://login.microsoftonline.com/<tenant>/v2.0), not a federation metadata or discovery-document URL.`,
      );
    }
  }

  /**
   * providerId is omitted for the singleton Entra ID (Azure AD) flow, whose
   * redirect URI is fixed (no dynamic segment, since Entra app registrations
   * pin an exact callback URL) - the actual provider is resolved by
   * workspace instead. It is always present for the generic, providerId-
   * scoped OIDC flow.
   */
  async buildAuthorizationUrl(
    providerId: string | undefined,
    workspaceId: string,
    redirect?: string,
  ): Promise<{ url: string; stateCookie: string }> {
    const provider = providerId
      ? await this.authProviderRepo.findById(providerId, workspaceId)
      : await this.authProviderRepo.findEntraProvider(workspaceId);
    if (!provider || !provider.isEnabled || !this.isOidcCapable(provider)) {
      throw new NotFoundException('SSO provider not found');
    }
    if (
      !provider.oidcIssuer ||
      !provider.oidcClientId ||
      !provider.oidcClientSecret
    ) {
      throw new BadRequestException('OIDC provider is not fully configured');
    }

    const config = await this.discover(provider);

    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    // Azure providers additionally request Graph's User.Read scope so the
    // resulting access_token can fetch the user's profile photo for avatar
    // sync (see handleCallback) - generic OIDC providers have no Graph API.
    const scope = this.isAzureProvider(provider)
      ? `openid profile email ${AZURE_GRAPH_SCOPE}`
      : 'openid profile email';

    // The redirect_uri shape (singleton vs providerId-scoped) mirrors how
    // this authorization request was reached, not how the provider was
    // resolved - the singleton /callback route always issues a singleton
    // redirect_uri, matching the fixed URI registered in Entra.
    const callbackUrl = this.buildCallbackUrl(providerId);
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const stateCookie = encodeOidcState(
      {
        providerId: provider.id,
        nonce,
        state,
        redirect,
        codeVerifier,
        singleton: providerId === undefined,
      },
      this.environmentService.getAppSecret(),
    );

    return { url: authUrl.href, stateCookie };
  }

  async handleCallback(params: {
    code: string;
    state: string;
    stateCookie: string;
    workspaceId: string;
  }): Promise<{ authToken: string; redirect?: string }> {
    const decoded = decodeOidcState(
      params.stateCookie,
      this.environmentService.getAppSecret(),
    );
    if (!decoded || decoded.state !== params.state || !decoded.codeVerifier) {
      throw new BadRequestException('Invalid or expired SSO state');
    }

    const provider = await this.authProviderRepo.findById(
      decoded.providerId,
      params.workspaceId,
    );
    if (!provider || !provider.isEnabled || !this.isOidcCapable(provider)) {
      throw new NotFoundException('SSO provider not found');
    }
    if (
      !provider.oidcIssuer ||
      !provider.oidcClientId ||
      !provider.oidcClientSecret
    ) {
      throw new BadRequestException('OIDC provider is not fully configured');
    }

    const config = await this.discover(provider);

    // Reconstructs the exact redirect_uri sent in the authorization request
    // (required for the token exchange to match per the OAuth spec) - based
    // on how this cycle was STARTED (decoded.singleton), not on whether a
    // providerId happens to be known now.
    const callbackUrl = this.buildCallbackUrl(
      decoded.singleton ? undefined : decoded.providerId,
    );
    const currentUrl = new URL(callbackUrl);
    currentUrl.searchParams.set('code', params.code);
    currentUrl.searchParams.set('state', params.state);

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: decoded.codeVerifier,
      expectedState: decoded.state,
      expectedNonce: decoded.nonce,
    });

    // The email/name claims come from the ID token returned by openid-client's
    // authorizationCodeGrant, which already performs full OIDC validation
    // (signature, issuer, audience, expiry) regardless of the issuer - Entra ID
    // included.
    const claims = tokens.claims();
    const providerUserId = claims?.sub as string | undefined;
    if (!providerUserId) {
      throw new BadRequestException('SSO provider did not return a subject claim');
    }

    // Azure AD only guarantees `preferred_username`; the `email` claim is
    // only emitted when the optional claim is configured on the app
    // registration and the user has a verified email on that domain.
    const email =
      (claims?.email as string | undefined) ??
      (claims?.preferred_username as string | undefined);
    const name = (claims?.name as string | undefined) ?? email;

    if (!email) {
      throw new BadRequestException('SSO provider did not return an email claim');
    }

    const user = await this.resolveUser({
      email,
      name,
      providerUserId,
      provider,
      workspaceId: params.workspaceId,
    });

    if (this.isAzureProvider(provider) && provider.avatarSync) {
      await this.syncAzureAvatar(user, provider.id, tokens.access_token);
    }

    await this.userRepo.updateLastLogin(user.id, params.workspaceId);
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'sso-oidc', providerId: provider.id },
    });

    const authToken = await this.sessionService.createSessionAndToken(user);
    const redirect = isSafeRedirectPath(decoded.redirect)
      ? decoded.redirect
      : '/';
    return { authToken, redirect };
  }

  /**
   * Resolves the login to a user, preferring the authAccounts link (keyed on
   * the IdP's own subject claim, so it survives the user's email changing at
   * the provider) and falling back to an email lookup for first-time logins -
   * mirroring this repo's own signup provisioning steps (addUserToWorkspace +
   * addUserToDefaultGroup) rather than creating a bare row.
   */
  private async resolveUser(params: {
    email: string;
    name: string | undefined;
    providerUserId: string;
    provider: { id: string; allowSignup: boolean };
    workspaceId: string;
  }): Promise<User> {
    const { email, name, providerUserId, provider, workspaceId } = params;

    return executeTx(this.db, async (trx) => {
      const linkedAccount = await this.authAccountRepo.findByProviderUserId(
        provider.id,
        providerUserId,
        workspaceId,
        trx,
      );

      let user: User | undefined;
      if (linkedAccount) {
        user = await this.userRepo.findById(linkedAccount.userId, workspaceId, {
          trx,
        });
      }

      if (!user) {
        user = await this.userRepo.findByEmail(email, workspaceId, { trx });
      }

      if (!user) {
        if (!provider.allowSignup) {
          throw new UnauthorizedException('User not provisioned');
        }
        user = await this.userRepo.insertUser(
          {
            email,
            name: name || email,
            password: nanoIdGen(16),
            workspaceId,
            role: UserRole.MEMBER,
          },
          trx,
        );
        await this.workspaceService.addUserToWorkspace(
          user.id,
          workspaceId,
          undefined,
          trx,
        );
        await this.groupUserRepo.addUserToDefaultGroup(user.id, workspaceId, trx);
      }

      await this.authAccountRepo.upsert(
        {
          userId: user.id,
          authProviderId: provider.id,
          providerUserId,
          workspaceId,
        },
        trx,
      );

      return user;
    });
  }

  /**
   * Best-effort profile photo sync from Microsoft Graph - must never block
   * login, so any failure (missing photo, expired token, network error) is
   * logged and swallowed rather than thrown.
   */
  private async syncAzureAvatar(
    user: User,
    providerId: string,
    accessToken: string | undefined,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }
    try {
      const response = await fetch(AZURE_GRAPH_PHOTO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        if (response.status !== 404) {
          this.logger.warn(
            `Azure avatar fetch failed with status=${response.status} providerId=${providerId} userId=${user.id}`,
          );
        }
        return;
      }
      const mimeType = response.headers.get('content-type')?.toLowerCase();
      if (!mimeType || !mimeType.startsWith('image/')) {
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return;
      }
      await this.attachmentService.uploadUserAvatarFromBuffer({
        buffer: Buffer.from(arrayBuffer),
        mimeType,
        userId: user.id,
        workspaceId: user.workspaceId,
      });
    } catch (error) {
      this.logger.warn(
        `Azure avatar sync errored for providerId=${providerId} userId=${user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Validates that a post-login redirect target is a safe, same-origin relative
 * path - rejecting anything that could be interpreted by a browser as
 * pointing to a different host (open redirect), such as protocol-relative
 * URLs (`//evil.com`), values containing a scheme (`http://evil.com`),
 * userinfo-style hosts (`@evil.com`), or backslashes (`\evil.com`, which some
 * browsers normalize like forward slashes).
 */
export function isSafeRedirectPath(path: string | undefined): path is string {
  if (!path) {
    return false;
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }
  if (path.includes('\\') || path.includes('@')) {
    return false;
  }
  return true;
}
