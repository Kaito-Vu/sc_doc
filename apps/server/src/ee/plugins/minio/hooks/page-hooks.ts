import { Injectable, Logger, Inject } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';

export enum CoreHooks {
  AFTER_PAGE_DELETE = 'page:afterDelete',
}

@Injectable()
export class MinioPageHooksHandler {
  private logger = new Logger(MinioPageHooksHandler.name);

  constructor(
    @Inject('HookRegistry') private hookRegistry: any,
    private attachmentService: AttachmentService,
  ) {}

  registerHooks(): void {
    // Register hook for page deletion
    this.hookRegistry.on(CoreHooks.AFTER_PAGE_DELETE, this.handlePageDelete.bind(this));

    // Note: Page rename is not yet in CoreHooks, but can be added
    // For now, we handle it via direct service call in controller
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
