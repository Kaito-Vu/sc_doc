import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface LoginHookContext {
  loginInput: {
    email: string
    password: string
    recaptchaToken?: string
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
  requiresMfaChallenge?: boolean
}

@Injectable()
export class BeforeLoginHandler {
  private readonly logger = new Logger(BeforeLoginHandler.name)

  constructor(
    private recaptcha: RecaptchaService,
    private configService: PluginConfigService,
    private verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: LoginHookContext): Promise<LoginHookContext> {
    const { loginInput, workspaceId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.login
    if (!actionConfig?.enabled) {
      return context
    }

    const token = loginInput.recaptchaToken
    if (!token) {
      throw new HttpException(
        'reCAPTCHA token required',
        HttpStatus.BAD_REQUEST,
      )
    }

    const verification = await this.recaptcha.verifyToken(
      token,
      pluginConfig.config.secretKey,
    )

    if (!verification.success) {
      this.logger.warn(
        `Token verification failed for user ${loginInput.email}: ${verification.errorCodes.join(', ')}`,
      )
      throw new HttpException(
        'reCAPTCHA verification failed',
        HttpStatus.BAD_REQUEST,
      )
    }

    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'login',
      actionConfig.threshold,
    )

    await this.verificationRepo.create({
      workspaceId,
      token,
      score: verification.score,
      action: 'login',
      decision: evaluation.decision,
      decisionReason: evaluation.reason,
      ipAddress: context.remoteAddress,
      userAgent: context.userAgent,
      challengeTs: verification.challengeTs,
    })

    switch (evaluation.decision) {
      case 'allow':
        this.logger.debug(
          `Login allowed for ${loginInput.email} (score: ${verification.score})`,
        )
        return context

      case 'challenge':
        this.logger.debug(
          `Login challenge required for ${loginInput.email} (score: ${verification.score})`,
        )
        context.requiresMfaChallenge = true
        return context

      case 'block':
        this.logger.warn(
          `Login blocked for ${loginInput.email} (score: ${verification.score})`,
        )
        throw new HttpException(
          'Your request was identified as a bot',
          HttpStatus.FORBIDDEN,
        )

      default:
        throw new HttpException(
          'Unexpected reCAPTCHA evaluation result',
          HttpStatus.INTERNAL_SERVER_ERROR,
        )
    }
  }
}
