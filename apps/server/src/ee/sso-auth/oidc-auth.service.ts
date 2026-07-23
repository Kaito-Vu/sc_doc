import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as client from 'openid-client';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { encodeOidcState, decodeOidcState } from './oidc-state.util';
import { UserRole } from '../../common/helpers/types/permission';
import { nanoIdGen } from '../../common/helpers';

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly userRepo: UserRepo,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  private buildCallbackUrl(providerId?: string): string {
    const base = `${this.environmentService.getAppUrl()}/api/sso/oidc`;
    return providerId ? `${base}/${providerId}/callback` : `${base}/callback`;
  }

  private isOidcCapable(provider: { type: string } | undefined): boolean {
    return provider?.type === 'oidc' || provider?.type === 'azure-ad';
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

    // The redirect_uri shape (singleton vs providerId-scoped) mirrors how
    // this authorization request was reached, not how the provider was
    // resolved - the singleton /callback route always issues a singleton
    // redirect_uri, matching the fixed URI registered in Entra.
    const callbackUrl = this.buildCallbackUrl(providerId);
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid profile email',
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
    // included. There is no Entra-specific config (tenantId, group sync rules,
    // etc.) wired up from the AuthProviders row today, so no additional
    // provider-specific handling is applied here.
    const claims = tokens.claims();
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

    // Mirrors SsoAuthService.ldapLogin's find-or-provision-by-email flow.
    let user = await this.userRepo.findByEmail(email, params.workspaceId);
    if (!user && provider.allowSignup) {
      user = await this.userRepo.insertUser({
        email,
        name: name || email,
        password: nanoIdGen(16),
        workspaceId: params.workspaceId,
        role: UserRole.MEMBER,
      });
    }
    if (!user) {
      throw new UnauthorizedException('User not provisioned');
    }

    const authToken = await this.sessionService.createSessionAndToken(user);
    const redirect = isSafeRedirectPath(decoded.redirect)
      ? decoded.redirect
      : '/';
    return { authToken, redirect };
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
