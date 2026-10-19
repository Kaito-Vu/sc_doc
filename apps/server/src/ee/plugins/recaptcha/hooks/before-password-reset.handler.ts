import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

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
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: PasswordResetHookContext): Promise<PasswordResetHookContext> {
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'passwordReset',
        token: context.passwordResetInput.recaptchaToken,
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
