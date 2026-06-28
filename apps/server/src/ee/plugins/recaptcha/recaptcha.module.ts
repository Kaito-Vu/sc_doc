import { Module, OnModuleInit, Inject } from '@nestjs/common'
import { RecaptchaService } from './recaptcha.service'
import { BeforeLoginHandler } from './hooks/before-login.handler'
import { BeforeSignupHandler } from './hooks/before-signup.handler'
import { RecaptchaVerificationRepo } from './repositories/recaptcha-verification.repo'
import { PluginConfigService } from '../services/plugin-config.service'
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
  constructor(
    private beLoginHandler: BeforeLoginHandler,
    private beSignupHandler: BeforeSignupHandler,
    private hookRegistry: HookRegistry,
    private configService: PluginConfigService
  ) {}

  async onModuleInit() {
    // Register hook handlers
    this.hookRegistry.on('auth:beforeLogin', async (context: any) => {
      return this.beLoginHandler.handle(context)
    })

    this.hookRegistry.on('auth:beforeSignup', async (context: any) => {
      return this.beSignupHandler.handle(context)
    })

    console.log('✓ reCAPTCHA v3 plugin initialized and hooks registered')
  }
}
