import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SsoService } from './sso.service';
import { SsoController } from './sso.controller';
import { AuthProviderRepo } from './auth-provider.repo';
import { AuthAccountRepo } from './auth-account.repo';
import { BeforeMembersQueryHandler } from './hooks/before-members-query.handler';
import { HookRegistry } from '../plugins/services/hook.registry';

@Module({
  providers: [
    SsoService,
    AuthProviderRepo,
    AuthAccountRepo,
    BeforeMembersQueryHandler,
  ],
  controllers: [SsoController],
  exports: [SsoService, AuthProviderRepo, AuthAccountRepo],
})
export class SsoModule implements OnModuleInit {
  private readonly logger = new Logger(SsoModule.name);

  constructor(
    private readonly beforeMembersQueryHandler: BeforeMembersQueryHandler,
    private readonly hookRegistry: HookRegistry,
  ) {}

  onModuleInit() {
    this.hookRegistry.on('workspace:beforeMembersQuery', async (context: any) => {
      return this.beforeMembersQueryHandler.handle(context);
    });
    this.logger.debug('Registered workspace:beforeMembersQuery hook handler');
  }
}
