import { Injectable } from '@nestjs/common';
import { OidcProviderStrategy } from '../oidc-provider-strategy.interface';

@Injectable()
export class GenericOidcStrategy implements OidcProviderStrategy {
  readonly flavor = 'generic' as const;

  getCallbackPath(): string {
    return '/api/sso/oidc/callback';
  }

  getExtraScopes(): string[] {
    return [];
  }

  normalizeIssuer(issuerUrl: URL): URL {
    return issuerUrl;
  }

  async fetchAvatar() {
    return undefined;
  }
}
