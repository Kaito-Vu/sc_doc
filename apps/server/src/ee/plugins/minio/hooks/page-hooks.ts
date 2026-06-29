import { Injectable, Logger } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';
import {
  getHookRegistry,
  HookContext,
  HookRegistry,
} from '../../../../core/plugins/plugin-hooks';

// Not part of the core CoreHooks enum (apps/server/src/core/plugins/plugin-hooks.ts)
// yet — no code currently emits this event, so registering on it is a no-op
// until an `afterDelete` emission is added to the page deletion flow.
const PAGE_AFTER_DELETE_HOOK = 'page:afterDelete';

@Injectable()
export class MinioPageHooksHandler {
  private readonly logger = new Logger(MinioPageHooksHandler.name);
  private hookRegistry: HookRegistry | null = null;

  constructor(private readonly attachmentService: AttachmentService) {}

  registerHooks(): void {
    this.hookRegistry = getHookRegistry();

    this.hookRegistry.on(
      PAGE_AFTER_DELETE_HOOK,
      this.handlePageDelete.bind(this),
    );
    this.logger.log('Page deletion hooks registered');
  }

  private async handlePageDelete(context: HookContext): Promise<void> {
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
