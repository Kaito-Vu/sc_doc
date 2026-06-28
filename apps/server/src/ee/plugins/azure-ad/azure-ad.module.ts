import { Module, OnModuleInit, Logger } from '@nestjs/common'
import { AzureAdService } from './services/azure-ad.service'
import { TokenValidationService } from './services/token-validation.service'
import { GroupSyncService } from './services/group-sync.service'
import { TokenCacheService } from './services/token-cache.service'
import { AvatarSyncService } from './services/avatar-sync.service'
import { AuthOidcLoginHandler } from './hooks/auth-oidc-login.handler'
import { AzureAdValidateTenantHandler } from './hooks/azure-ad-validate-tenant.handler'
import { HookRegistry } from '../services/hook.registry'
import { AzureAdController } from './azure-ad.controller'
import { AzureAdGroupSyncRepository } from './repositories/azure-ad-group-sync.repo'

@Module({
  providers: [
    AzureAdService,
    TokenValidationService,
    GroupSyncService,
    TokenCacheService,
    AvatarSyncService,
    AuthOidcLoginHandler,
    AzureAdValidateTenantHandler,
    AzureAdGroupSyncRepository,
  ],
  exports: [
    AzureAdService,
    TokenValidationService,
    GroupSyncService,
    TokenCacheService,
    AvatarSyncService,
    AuthOidcLoginHandler,
    AzureAdValidateTenantHandler,
    AzureAdGroupSyncRepository,
  ],
  controllers: [AzureAdController],
})
export class AzureAdModule implements OnModuleInit {
  private readonly logger = new Logger(AzureAdModule.name)

  constructor(
    private readonly authOidcLoginHandler: AuthOidcLoginHandler,
    private readonly validateTenantHandler: AzureAdValidateTenantHandler,
    private readonly hookRegistry: HookRegistry
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Azure AD plugin')

    // Register hooks
    this.hookRegistry.on('auth:oidcLogin', async (context: any) => {
      return this.authOidcLoginHandler.handle(context)
    })

    this.hookRegistry.on('azure-ad:validateTenant', async (context: any) => {
      return this.validateTenantHandler.handle(context)
    })

    this.logger.log('Azure AD plugin initialized with OIDC login and tenant validation hooks')
  }
}
