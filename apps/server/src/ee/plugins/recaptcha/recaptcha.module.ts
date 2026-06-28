import { Module, OnModuleInit, Logger } from '@nestjs/common'
import { RecaptchaService } from './recaptcha.service'
import { BeforeLoginHandler } from './hooks/before-login.handler'
import { BeforeSignupHandler } from './hooks/before-signup.handler'
import { RecaptchaVerificationRepo } from './repositories/recaptcha-verification.repo'
import { HookRegistry } from '../services/hook.registry'

@Module({
  providers: [
    RecaptchaService,
    BeforeLoginHandler,
    BeforeSignupHandler,
    RecaptchaVerificationRepo
  ],
  exports: [RecaptchaService, RecaptchaVerificationRepo]
})
export class RecaptchaModule implements OnModuleInit {
  private readonly logger = new Logger(RecaptchaModule.name)

  constructor(
    private beLoginHandler: BeforeLoginHandler,
    private beSignupHandler: BeforeSignupHandler,
    private hookRegistry: HookRegistry,
  ) {}

  async onModuleInit() {
    // Register hook handlers
    this.hookRegistry.on('auth:beforeLogin', async (context: any) => {
      return this.beLoginHandler.handle(context)
    })

    this.hookRegistry.on('auth:beforeSignup', async (context: any) => {
      return this.beSignupHandler.handle(context)
    })

    this.logger.log('reCAPTCHA v3 plugin initialized and hooks registered')
  }
}
