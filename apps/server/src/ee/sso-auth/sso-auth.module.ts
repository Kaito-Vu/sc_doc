import { Module } from '@nestjs/common';
import { SsoAuthService } from './sso-auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { SsoAuthController } from './sso-auth.controller';
import { SsoModule } from '../sso/sso.module';
import { MfaModule } from '../mfa/mfa.module';
import { SessionModule } from '../../core/session/session.module';
import { WorkspaceModule } from '../../core/workspace/workspace.module';
import { AttachmentModule } from '../../core/attachment/attachment.module';
import { GenericOidcStrategy } from './strategies/generic-oidc.strategy';
import { EntraIdStrategy } from './strategies/entra-id.strategy';
import { OidcProviderStrategyFactory } from './oidc-provider-strategy.factory';

@Module({
  imports: [
    SsoModule,
    MfaModule,
    SessionModule,
    WorkspaceModule,
    AttachmentModule,
  ],
  providers: [
    SsoAuthService,
    OidcAuthService,
    GenericOidcStrategy,
    EntraIdStrategy,
    OidcProviderStrategyFactory,
  ],
  controllers: [SsoAuthController],
})
export class SsoAuthModule {}
