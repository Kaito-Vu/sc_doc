import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'

export interface ShareGetInfoHookContext {
  shareId: string
  workspaceId: string
  recaptchaToken?: string
  remoteAddress?: string
  userAgent?: string
}

@Injectable()
export class BeforeShareGetInfoHandler {
  constructor(private readonly recaptcha: RecaptchaService) {}

  async handle(context: ShareGetInfoHookContext): Promise<ShareGetInfoHookContext> {
    // Public share links: the token is optional. If provided it is verified;
    // if not, access is allowed (and logged at debug level).
    const evaluation = await this.recaptcha.verifyAction(
      {
        workspaceId: context.workspaceId,
        action: 'shareGetInfo',
        token: context.recaptchaToken,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      },
      { defaultThreshold: 0.3, tokenOptional: true },
    )

    if (evaluation?.decision === 'block') {
      throw new HttpException(
        'Your request was identified as suspicious.',
        HttpStatus.FORBIDDEN,
      )
    }

    return context
  }
}
