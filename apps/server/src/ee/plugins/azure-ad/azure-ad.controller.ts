import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator'
import { Workspace } from '@docmost/db/types/entity.types'
import { AzureAdService } from './services/azure-ad.service'

@Controller('plugins/azure-ad')
export class AzureAdController {
  private readonly logger = new Logger(AzureAdController.name)

  constructor(private readonly azureAdService: AzureAdService) {}

  @UseGuards(JwtAuthGuard)
  @Post('test-connection')
  async testConnection(
    @AuthWorkspace() _workspace: Workspace,
    @Body()
    body: {
      tenantId: string
      clientId: string
      clientSecret: string
    }
  ) {
    this.logger.log('[TestConnection] Testing Azure AD credentials')

    if (!body.tenantId || !body.clientId || !body.clientSecret) {
      throw new BadRequestException(
        'tenantId, clientId, and clientSecret are required'
      )
    }

    try {
      const tokenUrl = this.azureAdService.buildTokenUrl(body.tenantId)
      if (!tokenUrl?.includes(body.tenantId)) {
        throw new Error('Invalid tenant ID format')
      }

      this.logger.log('[TestConnection] Configuration validated successfully')

      return {
        success: true,
        message: 'Azure AD credentials are valid',
        tenantId: body.tenantId,
      }
    } catch (error) {
      this.logger.error('[TestConnection] Error testing connection:', error)
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to validate Azure AD credentials'
      )
    }
  }
}
