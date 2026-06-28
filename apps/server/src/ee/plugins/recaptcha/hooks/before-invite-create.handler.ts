import { Injectable, Logger } from '@nestjs/common'
import { PluginConfigService } from '../../services/plugin-config.service'

export interface InviteCreateHookContext {
  inviteInput: {
    emails: string[]
    role?: string
  }
  workspaceId: string
  userId: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeInviteCreateHandler {
  private readonly logger = new Logger(BeforeInviteCreateHandler.name)

  constructor(private readonly configService: PluginConfigService) {}

  async handle(context: InviteCreateHookContext): Promise<InviteCreateHookContext> {
    const { inviteInput, workspaceId, userId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    const shouldLog =
      pluginConfig.enabled &&
      pluginConfig.config?.actions?.inviteCreate?.enabled

    if (shouldLog) {
      // For authenticated endpoints, we may not have reCAPTCHA token.
      // In that case, we log but don't block (rate limiting will be enforced separately).
      // This handler provides additional protection for suspicious patterns.
      this.logger.debug(
        `Workspace invitations created by ${userId} for ${inviteInput.emails.join(', ')}`,
      )
    }

    return context
  }
}
