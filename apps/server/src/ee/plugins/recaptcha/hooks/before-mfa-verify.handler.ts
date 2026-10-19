import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

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
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: MfaVerifyHookContext): Promise<MfaVerifyHookContext> {
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'mfaVerify',
        token: context.mfaVerifyInput.recaptchaToken,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      },
      { defaultThreshold: 0.5 },
    )

    if (evaluation?.decision === 'block') {
      throw new HttpException(
        'Too many failed attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    return context
  }
}
