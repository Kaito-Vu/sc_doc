import { Injectable, Logger, Optional } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';

export enum CoreHooks {
  AFTER_PAGE_DELETE = 'page:afterDelete',
}

@Injectable()
export class MinioPageHooksHandler {
  private logger = new Logger(MinioPageHooksHandler.name);
  private hookRegistry: any = null;

  constructor(private attachmentService: AttachmentService) {}

  registerHooks(): void {
    // Note: HookRegistry is available globally from PluginsModule
    // We'll attempt to register hooks when called, but won't fail if unavailable
    // This allows the plugin to work even without hook integration initially

    try {
      const { getHookRegistry } = require('../../../core/plugins/plugin-hooks');
      this.hookRegistry = getHookRegistry();

      if (this.hookRegistry) {
        this.hookRegistry.on(CoreHooks.AFTER_PAGE_DELETE, this.handlePageDelete.bind(this));
        this.logger.log('Page deletion hooks registered');
      }
    } catch (error) {
      // Hooks may not be fully initialized yet, log warning but don't fail
      this.logger.warn('Could not register page deletion hooks - they may be registered later');
    }
  }

  private async handlePageDelete(context: any): Promise<void> {
    try {
      const { pageId, workspaceId } = context;

      if (!pageId || !workspaceId) {
        this.logger.warn('Missing pageId or workspaceId in page delete context');
        return;
      }

      this.logger.debug(`Handling attachments for deleted page: ${pageId}`);

      // Find all attachments for this page
      // Note: This could be extended to also delete from MinIO
      // For now, attachments are just marked as orphaned and cleaned up by GC job

    } catch (error) {
      const errorMsg = error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error);
      this.logger.error(`Failed to handle page delete: ${errorMsg}`);
      // Don't throw - let hook chain continue
    }
  }
}
