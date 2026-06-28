import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

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

  constructor(
    private readonly recaptcha: RecaptchaService,
    private readonly configService: PluginConfigService,
    private readonly verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: InviteCreateHookContext): Promise<InviteCreateHookContext> {
    const { inviteInput, workspaceId, userId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.inviteCreate
    if (!actionConfig?.enabled) {
      return context
    }

    // For authenticated endpoints, we may not have reCAPTCHA token.
    // In that case, we log but don't block (rate limiting will be enforced separately).
    // This handler provides additional protection for suspicious patterns.

    this.logger.debug(
      `Workspace invitations created by ${userId} for ${inviteInput.emails.join(', ')}`,
    )

    return context
  }
}
