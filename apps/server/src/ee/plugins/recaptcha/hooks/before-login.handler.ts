import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

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
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: LoginHookContext): Promise<LoginHookContext> {
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'login',
        token: context.loginInput.recaptchaToken,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      },
      { defaultThreshold: 0.5 },
    )

    if (!evaluation || evaluation.decision === 'allow') return context

    if (evaluation.decision === 'challenge') {
      context.requiresMfaChallenge = true
      return context
    }

    throw new HttpException(
      'Your request was identified as a bot',
      HttpStatus.FORBIDDEN,
    )
  }
}
