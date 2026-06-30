import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { FaviconUploadHandler } from './handlers/favicon-upload.handler';
import { WorkspaceFaviconRepository } from './repositories/workspace-favicon.repo';
import { WorkspaceFaviconController } from './controllers/workspace-favicon.controller';
import { HookRegistry } from '../services/hook.registry';
import { CoreHooks } from '../../../core/plugins/plugin-hooks';

@Module({
  providers: [
    FaviconUploadHandler,
    WorkspaceFaviconRepository,
  ],
  controllers: [WorkspaceFaviconController],
  exports: [WorkspaceFaviconRepository],
})
export class WorkspaceFaviconModule implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceFaviconModule.name);

  constructor(
    private readonly faviconUploadHandler: FaviconUploadHandler,
    private readonly hookRegistry: HookRegistry,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Workspace Favicon plugin');

    // Register favicon upload hook
    this.hookRegistry.on(
      CoreHooks.CUSTOM_ATTACHMENT_UPLOAD,
      async (context) => {
        return this.faviconUploadHandler.handle(context);
      },
    );

    this.logger.log('Workspace Favicon plugin initialized');
  }
}
