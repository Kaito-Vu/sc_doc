import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HookRegistry } from '../services/hook.registry';
import { CoreHooks } from '../../../core/plugins/plugin-hooks';
import { SESSION_GUARD_QUEUE } from './session-guard.constants';
import { SessionGuardService } from './session-guard.service';
import { SessionGuardStore } from './session-guard.store';
import { SessionGuardProcessor } from './session-guard.processor';
import { SessionGuardController } from './session-guard.controller';
import { AfterSessionCreatedHandler } from './hooks/after-session-created.handler';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SESSION_GUARD_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  providers: [
    SessionGuardService,
    SessionGuardStore,
    SessionGuardProcessor,
    AfterSessionCreatedHandler,
  ],
  controllers: [SessionGuardController],
})
export class SessionGuardModule implements OnModuleInit {
  private readonly logger = new Logger(SessionGuardModule.name);

  constructor(
    private readonly hookRegistry: HookRegistry,
    private readonly afterSessionCreatedHandler: AfterSessionCreatedHandler,
  ) {}

  onModuleInit(): void {
    this.hookRegistry.on(CoreHooks.AFTER_SESSION_CREATED, (context) =>
      this.afterSessionCreatedHandler.handle(context),
    );

    this.logger.log('Session guard plugin initialized');
  }
}
