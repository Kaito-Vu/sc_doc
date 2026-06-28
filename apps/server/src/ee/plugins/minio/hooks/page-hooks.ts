import { Injectable, Logger } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';

export enum CoreHooks {
  AFTER_PAGE_DELETE = 'page:afterDelete',
}

@Injectable()
export class MinioPageHooksHandler {
  private readonly logger = new Logger(MinioPageHooksHandler.name);
  private hookRegistry: any = null;

  constructor(private readonly attachmentService: AttachmentService) {}

  registerHooks(): void {
    const { getHookRegistry } = require('../../../core/plugins/plugin-hooks');
    this.hookRegistry = getHookRegistry();

    this.hookRegistry.on(
      CoreHooks.AFTER_PAGE_DELETE,
      this.handlePageDelete.bind(this),
    );
    this.logger.log('Page deletion hooks registered');
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
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle page delete: ${errorMsg}`);
      // Don't throw - let hook chain continue
    }
  }
}
