import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface MfaVerifyHookContext {
  mfaVerifyInput: {
    mfaToken: string
    code: string
    recaptchaToken?: string
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeMfaVerifyHandler {
  private readonly logger = new Logger(BeforeMfaVerifyHandler.name)

  constructor(
    private readonly recaptcha: RecaptchaService,
    private readonly configService: PluginConfigService,
    private readonly verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: MfaVerifyHookContext): Promise<MfaVerifyHookContext> {
    const { mfaVerifyInput, workspaceId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.mfaVerify
    if (!actionConfig?.enabled) {
      return context
    }

    const token = mfaVerifyInput.recaptchaToken
    if (!token) {
      throw new HttpException(
        'reCAPTCHA token required for MFA verification',
        HttpStatus.BAD_REQUEST,
      )
    }

    const verification = await this.recaptcha.verifyToken(
      token,
      pluginConfig.config.secretKey,
    )

    if (!verification.success) {
      this.logger.warn(
        `Token verification failed for mfa-verify: ${verification.errorCodes.join(', ')}`,
      )
      throw new HttpException(
        'reCAPTCHA verification failed',
        HttpStatus.BAD_REQUEST,
      )
    }

    const threshold = actionConfig.threshold ?? 0.5
    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'mfaVerify',
      threshold,
    )

    await this.verificationRepo.create({
      workspaceId,
      token,
      score: verification.score,
      action: 'mfaVerify',
      decision: evaluation.decision,
      decisionReason: evaluation.reason,
      ipAddress: context.remoteAddress,
      userAgent: context.userAgent,
      challengeTs: verification.challengeTs,
    })

    if (evaluation.decision === 'block') {
      this.logger.warn(
        `MFA verification attempt blocked (score: ${verification.score})`,
      )
      throw new HttpException(
        'Too many failed attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    return context
  }
}
