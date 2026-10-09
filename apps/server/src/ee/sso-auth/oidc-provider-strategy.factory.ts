import { Injectable } from '@nestjs/common';
import { OidcProviderStrategy } from './oidc-provider-strategy.interface';
import { GenericOidcStrategy } from './strategies/generic-oidc.strategy';
import { EntraIdStrategy } from './strategies/entra-id.strategy';

@Injectable()
export class OidcProviderStrategyFactory {
  constructor(
    private readonly genericStrategy: GenericOidcStrategy,
    private readonly entraIdStrategy: EntraIdStrategy,
  ) {}

  create(provider: { settings?: any }): OidcProviderStrategy {
    if (provider.settings?.oidc?.provider === 'azuread') {
      return this.entraIdStrategy;
    }
    return this.genericStrategy;
  }
}
