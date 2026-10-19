import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

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
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: SignupHookContext): Promise<SignupHookContext> {
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'signup',
        token: context.signupInput.recaptchaToken,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      },
      { defaultThreshold: 0.7 },
    )

    if (!evaluation || evaluation.decision === 'allow') return context

    throw new HttpException(
      evaluation.decision === 'challenge'
        ? 'Signup blocked - please try again later'
        : 'Signup blocked due to security checks',
      HttpStatus.FORBIDDEN,
    )
  }
}
