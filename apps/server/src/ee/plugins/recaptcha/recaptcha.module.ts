import { Module, OnModuleInit, Logger } from '@nestjs/common'
import { RecaptchaService } from './recaptcha.service'
import { BeforeLoginHandler } from './hooks/before-login.handler'
import { BeforeSignupHandler } from './hooks/before-signup.handler'
import { BeforeForgotPasswordHandler } from './hooks/before-forgot-password.handler'
import { BeforePasswordResetHandler } from './hooks/before-password-reset.handler'
import { BeforeMfaVerifyHandler } from './hooks/before-mfa-verify.handler'
import { BeforeInviteCreateHandler } from './hooks/before-invite-create.handler'
import { BeforeShareGetInfoHandler } from './hooks/before-share-get-info.handler'
import { RecaptchaVerificationRepo } from './repositories/recaptcha-verification.repo'
import { HookRegistry } from '../services/hook.registry'

@Module({
  providers: [
    RecaptchaService,
    BeforeLoginHandler,
    BeforeSignupHandler,
    BeforeForgotPasswordHandler,
    BeforePasswordResetHandler,
    BeforeMfaVerifyHandler,
    BeforeInviteCreateHandler,
    BeforeShareGetInfoHandler,
    RecaptchaVerificationRepo
  ],
  exports: [RecaptchaService, RecaptchaVerificationRepo]
})
export class RecaptchaModule implements OnModuleInit {
  private readonly logger = new Logger(RecaptchaModule.name)

  constructor(
    private readonly beLoginHandler: BeforeLoginHandler,
    private readonly beSignupHandler: BeforeSignupHandler,
    private readonly beForgotPasswordHandler: BeforeForgotPasswordHandler,
    private readonly bePasswordResetHandler: BeforePasswordResetHandler,
    private readonly beMfaVerifyHandler: BeforeMfaVerifyHandler,
    private readonly beInviteCreateHandler: BeforeInviteCreateHandler,
    private readonly beShareGetInfoHandler: BeforeShareGetInfoHandler,
    private readonly hookRegistry: HookRegistry,
  ) {}

  async onModuleInit() {
    // Register hook handlers
    this.hookRegistry.on('auth:beforeLogin', async (context: any) => {
      return this.beLoginHandler.handle(context)
    })

    this.hookRegistry.on('auth:beforeSignup', async (context: any) => {
      return this.beSignupHandler.handle(context)
    })

    this.hookRegistry.on('auth:beforeForgotPassword', async (context: any) => {
      return this.beForgotPasswordHandler.handle(context)
    })

    this.hookRegistry.on('auth:beforePasswordReset', async (context: any) => {
      return this.bePasswordResetHandler.handle(context)
    })

    this.hookRegistry.on('mfa:beforeVerify', async (context: any) => {
      return this.beMfaVerifyHandler.handle(context)
    })

    this.hookRegistry.on('workspace:beforeInviteCreate', async (context: any) => {
      return this.beInviteCreateHandler.handle(context)
    })

    this.hookRegistry.on('share:beforeGetInfo', async (context: any) => {
      return this.beShareGetInfoHandler.handle(context)
    })

    this.logger.log('reCAPTCHA v3 plugin initialized with enhanced security hooks')
  }
}
