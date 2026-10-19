import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

export interface ForgotPasswordHookContext {
  forgotPasswordInput: {
    email: string
    recaptchaToken?: string
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeForgotPasswordHandler {
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: ForgotPasswordHookContext): Promise<ForgotPasswordHookContext> {
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'forgotPassword',
        token: context.forgotPasswordInput.recaptchaToken,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      },
      { defaultThreshold: 0.3 },
    )

    if (evaluation?.decision === 'block') {
      throw new HttpException(
        'Your request was identified as suspicious. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    return context
  }
}
