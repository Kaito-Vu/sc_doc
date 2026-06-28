import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'

export interface ValidateTenantContext {
  providedTenantId: string
  configuredTenantId: string
  userEmail: string
}

@Injectable()
export class AzureAdValidateTenantHandler {
  private readonly logger = new Logger(AzureAdValidateTenantHandler.name)

  async handle(context: ValidateTenantContext): Promise<ValidateTenantContext> {
    this.logger.debug(
      `[Azure AD] Validating tenant for user: ${context.userEmail}`
    )

    if (context.providedTenantId !== context.configuredTenantId) {
      this.logger.warn(
        `Tenant mismatch: provided ${context.providedTenantId}, configured ${context.configuredTenantId}`
      )
      throw new UnauthorizedException(
        'User tenant does not match workspace configuration'
      )
    }

    this.logger.debug('Tenant validation passed')
    return context
  }
}
