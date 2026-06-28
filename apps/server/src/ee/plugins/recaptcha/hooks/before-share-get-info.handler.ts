import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface ShareGetInfoHookContext {
  shareId: string
  workspaceId: string
  recaptchaToken?: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeShareGetInfoHandler {
  private readonly logger = new Logger(BeforeShareGetInfoHandler.name)

  constructor(
    private readonly recaptcha: RecaptchaService,
    private readonly configService: PluginConfigService,
    private readonly verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: ShareGetInfoHookContext): Promise<ShareGetInfoHookContext> {
    const { shareId, workspaceId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.shareGetInfo
    if (!actionConfig?.enabled) {
      return context
    }

    // For public share links, reCAPTCHA token is optional.
    // If provided, verify it. If not provided, allow access but log for analysis.
    const token = context.recaptchaToken

    if (!token) {
      this.logger.debug(`Share info access without reCAPTCHA token for ${shareId}`)
      return context
    }

    const verification = await this.recaptcha.verifyToken(
      token,
      pluginConfig.config.secretKey,
    )

    if (!verification.success) {
      this.logger.warn(
        `Token verification failed for share-get-info: ${verification.errorCodes.join(', ')}`,
      )
      throw new HttpException(
        'reCAPTCHA verification failed',
        HttpStatus.BAD_REQUEST,
      )
    }

    const threshold = actionConfig.threshold ?? 0.3
    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'shareGetInfo',
      threshold,
    )

    await this.verificationRepo.create({
      workspaceId,
      token,
      score: verification.score,
      action: 'shareGetInfo',
      decision: evaluation.decision,
      decisionReason: evaluation.reason,
      ipAddress: context.remoteAddress,
      userAgent: context.userAgent,
      challengeTs: verification.challengeTs,
    })

    if (evaluation.decision === 'block') {
      this.logger.warn(
        `Share info access blocked (score: ${verification.score})`,
      )
      throw new HttpException(
        'Your request was identified as suspicious.',
        HttpStatus.FORBIDDEN,
      )
    }

    return context
  }
}
