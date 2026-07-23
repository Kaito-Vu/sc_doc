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
import { FastifyReply } from 'fastify';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { SsoService } from '../sso/sso.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { MfaGateService } from '../mfa/services/mfa-gate.service';
import { encodeOidcState, decodeOidcState } from './oidc-state.util';
import { UserRole } from '../../common/helpers/types/permission';
import { nanoIdGen } from '../../common/helpers';
import { OidcProviderStrategyFactory } from './oidc-provider-strategy.factory';

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    private readonly ssoService: SsoService,
    private readonly userRepo: UserRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly workspaceService: WorkspaceService,
    private readonly environmentService: EnvironmentService,
    private readonly attachmentService: AttachmentService,
    private readonly mfaGateService: MfaGateService,
    private readonly strategyFactory: OidcProviderStrategyFactory,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private buildCallbackUrl(): string {
    return `${this.environmentService.getAppUrl()}/api/sso/oidc/callback`;
  }

  private isOidcCapable(provider: { type: string } | undefined): boolean {
    return provider?.type === 'oidc';
  }

  /**
   * Tolerates a common admin mistake when pasting an issuer: pasting the
   * full `.well-known/openid-configuration` discovery URL instead of the
   * issuer base URL `client.discovery()` expects.
   */
  private normalizeIssuerUrl(
    rawIssuer: string,
    provider: { settings?: any },
  ): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawIssuer.trim());
    } catch {
      throw new BadRequestException(
        'Invalid OIDC issuer URL. Expected an issuer base URL.',
      );
    }

    const wellKnownSuffix = '/.well-known/openid-configuration';
    if (parsed.pathname.toLowerCase().endsWith(wellKnownSuffix)) {
      parsed.pathname = parsed.pathname.slice(0, -wellKnownSuffix.length) || '/';
    }

    const strategy = this.strategyFactory.create(provider);
    return strategy.normalizeIssuer(parsed);
  }

  private async discover(
    provider: {
      oidcIssuer: string;
      oidcClientId: string;
      oidcClientSecret: string;
      settings?: any;
    },
  ) {
    const issuerUrl = this.normalizeIssuerUrl(provider.oidcIssuer, provider);
    const clientSecret = this.ssoService.decryptSecret(provider.oidcClientSecret);
    try {
      return await client.discovery(
        issuerUrl,
        provider.oidcClientId,
        clientSecret,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OIDC discovery failed for issuer=${issuerUrl.toString()}: ${message}`,
      );
      throw new BadRequestException(
        `OIDC discovery failed for issuer ${issuerUrl.toString()}. Verify the issuer is the OIDC issuer base URL, not a discovery-document URL.`,
      );
    }
  }

  async buildAuthorizationUrl(
    providerId: string,
    workspaceId: string,
    redirect?: string,
  ): Promise<{ url: string; stateCookie: string }> {
    const provider = await this.authProviderRepo.findById(providerId, workspaceId);
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
    const strategy = this.strategyFactory.create(provider);

    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    const scope = ['openid', 'profile', 'email', ...strategy.getExtraScopes()].join(
      ' ',
    );

    const callbackUrl = this.buildCallbackUrl();
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
    workspace: Workspace;
    res: FastifyReply;
  }): Promise<{
    requiresMfa: boolean;
    authToken?: string;
    redirect?: string;
  }> {
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
    const strategy = this.strategyFactory.create(provider);

    // Reconstructs the exact redirect_uri sent in the authorization request
    // (required for the token exchange to match per the OAuth spec).
    const callbackUrl = this.buildCallbackUrl();
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
    // (signature, issuer, audience, expiry) regardless of the issuer.
    const claims = tokens.claims();
    const providerUserId = claims?.sub as string | undefined;
    if (!providerUserId) {
      throw new BadRequestException('SSO provider did not return a subject claim');
    }

    // Some providers only guarantee `preferred_username`; `email` is only
    // emitted when the provider is configured to include it.
    const email =
      (claims?.email as string | undefined) ??
      (claims?.preferred_username as string | undefined);
    const fullName = [claims?.given_name, claims?.family_name]
      .filter(Boolean)
      .join(' ');
    const name =
      (claims?.name as string | undefined) || fullName || email;

    if (!email) {
      throw new BadRequestException('SSO provider did not return an email claim');
    }

    const avatarImage = await strategy.fetchAvatar(tokens);

    const user = await this.resolveUser({
      email,
      name,
      providerUserId,
      provider,
      workspaceId: params.workspaceId,
      avatarImage,
    });

    await this.userRepo.updateLastLogin(user.id, params.workspaceId);

    const redirect = isSafeRedirectPath(decoded.redirect)
      ? decoded.redirect
      : '/';

    const mfaResult = await this.mfaGateService.checkAndChallenge(
      user,
      params.workspace,
      params.res,
      {
        method: 'oidc',
        providerId: provider.id,
        providerName: provider.name,
      },
    );

    return { ...mfaResult, redirect };
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
    avatarImage?: { buffer: Buffer; mimeType: string };
  }): Promise<User> {
    const { email, name, providerUserId, provider, workspaceId, avatarImage } =
      params;

    const user = await executeTx(this.db, async (trx) => {
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

    if (avatarImage) {
      try {
        await this.attachmentService.uploadUserAvatarFromBuffer({
          buffer: avatarImage.buffer,
          mimeType: avatarImage.mimeType,
          userId: user.id,
          workspaceId,
        });
      } catch (error) {
        this.logger.warn(`Failed to sync avatar from IdP: ${error}`);
      }
    }

    return user;
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
