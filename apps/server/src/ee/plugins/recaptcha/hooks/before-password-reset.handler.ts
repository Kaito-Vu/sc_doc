import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface PasswordResetHookContext {
  passwordResetInput: {
    token: string
    newPassword: string
    recaptchaToken?: string
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforePasswordResetHandler {
  private readonly logger = new Logger(BeforePasswordResetHandler.name)

  constructor(
    private readonly recaptcha: RecaptchaService,
    private readonly configService: PluginConfigService,
    private readonly verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: PasswordResetHookContext): Promise<PasswordResetHookContext> {
    const { passwordResetInput, workspaceId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.passwordReset
    if (!actionConfig?.enabled) {
      return context
    }

    const token = passwordResetInput.recaptchaToken
    if (!token) {
      throw new HttpException(
        'reCAPTCHA token required for password reset',
        HttpStatus.BAD_REQUEST,
      )
    }

    const verification = await this.recaptcha.verifyToken(
      token,
      pluginConfig.config.secretKey,
    )

    if (!verification.success) {
      this.logger.warn(
        `Token verification failed for password-reset: ${verification.errorCodes.join(', ')}`,
      )
      throw new HttpException(
        'reCAPTCHA verification failed',
        HttpStatus.BAD_REQUEST,
      )
    }

    const threshold = actionConfig.threshold ?? 0.3
    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'passwordReset',
      threshold,
    )

    await this.verificationRepo.create({
      workspaceId,
      token,
      score: verification.score,
      action: 'passwordReset',
      decision: evaluation.decision,
      decisionReason: evaluation.reason,
      ipAddress: context.remoteAddress,
      userAgent: context.userAgent,
      challengeTs: verification.challengeTs,
    })

    if (evaluation.decision === 'block') {
      this.logger.warn(
        `Password-reset request blocked (score: ${verification.score})`,
      )
      throw new HttpException(
        'Your request was identified as suspicious. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    return context
  }
}
