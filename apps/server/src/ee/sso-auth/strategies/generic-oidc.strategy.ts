import { Injectable } from '@nestjs/common';
import { OidcProviderStrategy } from '../oidc-provider-strategy.interface';

@Injectable()
export class GenericOidcStrategy implements OidcProviderStrategy {
  readonly flavor = 'generic' as const;

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
