import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'

export interface SignupHookContext {
  signupInput: {
    email: string
    password: string
    name: string
    recaptchaToken?: string
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeSignupHandler {
  private readonly logger = new Logger(BeforeSignupHandler.name)

  constructor(
    private recaptcha: RecaptchaService,
    private configService: PluginConfigService,
    private verificationRepo: RecaptchaVerificationRepo,
  ) {}

  async handle(context: SignupHookContext): Promise<SignupHookContext> {
    const { signupInput, workspaceId } = context

    const pluginConfig = await this.configService.getConfig(
      workspaceId,
      'recaptcha',
    )

    if (!pluginConfig.enabled) {
      return context
    }

    const actionConfig = pluginConfig.config?.actions?.signup
    if (!actionConfig?.enabled) {
      return context
    }

    const token = signupInput.recaptchaToken
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
        `Token verification failed for signup ${signupInput.email}: ${verification.errorCodes.join(', ')}`,
      )
      throw new HttpException(
        'reCAPTCHA verification failed',
        HttpStatus.BAD_REQUEST,
      )
    }

    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'signup',
      actionConfig.threshold,
    )

    await this.verificationRepo.create({
      workspaceId,
      token,
      score: verification.score,
      action: 'signup',
      decision: evaluation.decision,
      decisionReason: evaluation.reason,
      ipAddress: context.remoteAddress,
      userAgent: context.userAgent,
      challengeTs: verification.challengeTs,
    })

    switch (evaluation.decision) {
      case 'allow':
        this.logger.debug(
          `Signup allowed for ${signupInput.email} (score: ${verification.score})`,
        )
        return context

      case 'challenge':
        this.logger.warn(
          `Signup blocked for ${signupInput.email} (score: ${verification.score})`,
        )
        throw new HttpException(
          'Signup blocked - please try again later',
          HttpStatus.FORBIDDEN,
        )

      case 'block':
        this.logger.warn(
          `Signup blocked for ${signupInput.email} (score: ${verification.score})`,
        )
        throw new HttpException(
          'Signup blocked due to security checks',
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
