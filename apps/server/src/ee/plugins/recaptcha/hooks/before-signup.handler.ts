import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common'
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
    private verificationRepo: RecaptchaVerificationRepo
  ) {}

  async handle(context: SignupHookContext): Promise<SignupHookContext> {
    try {
      const { signupInput, workspaceId } = context

      // 1. Get plugin config
      const pluginConfig = await this.configService.getConfig(workspaceId, 'recaptcha')

      // 2. Check if plugin is enabled
      if (!pluginConfig.enabled) {
        return context
      }

      // 3. Get action-specific config
      const actionConfig = pluginConfig.config?.actions?.signup
      if (!actionConfig?.enabled) {
        return context
      }

      // 4. Check for reCAPTCHA token
      const token = signupInput.recaptchaToken
      if (!token) {
        throw new HttpException('reCAPTCHA token required', HttpStatus.BAD_REQUEST)
      }

      // 5. Verify token with Google
      const verification = await this.recaptcha.verifyToken(
        token,
        pluginConfig.config.secretKey
      )

      if (!verification.success) {
        this.logger.warn(
          `Token verification failed for signup ${signupInput.email}: ${verification.errorCodes.join(', ')}`
        )
        throw new HttpException('reCAPTCHA verification failed', HttpStatus.BAD_REQUEST)
      }

      // 6. Evaluate score (stricter for signup)
      const evaluation = await this.recaptcha.evaluateScore(
        verification.score,
        'signup',
        actionConfig.threshold
      )

      // 7. Log verification to database
      await this.verificationRepo.create({
        workspaceId,
        token,
        score: verification.score,
        action: 'signup',
        decision: evaluation.decision,
        decisionReason: evaluation.reason,
        ipAddress: context.remoteAddress,
        userAgent: context.userAgent,
        challengeTs: verification.challengeTs
      })

      // 8. Handle decision (signup is stricter - block more aggressively)
      switch (evaluation.decision) {
        case 'allow':
          this.logger.debug(`Signup allowed for ${signupInput.email} (score: ${verification.score})`)
          return context

        case 'challenge':
          // For signup, challenge means block (no MFA on signup)
          this.logger.warn(`Signup blocked for ${signupInput.email} (score: ${verification.score})`)
          throw new HttpException('Signup blocked - please try again later', HttpStatus.FORBIDDEN)

        case 'block':
          this.logger.warn(`Signup blocked for ${signupInput.email} (score: ${verification.score})`)
          throw new HttpException('Signup blocked due to security checks', HttpStatus.FORBIDDEN)
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      this.logger.error('reCAPTCHA verification error', error instanceof Error ? error.message : 'Unknown error')

      // Fallback: block signup if verification fails
      throw new HttpException('Signup temporarily unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }
}
