import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StorageService } from '../../../../integrations/storage/storage.service';
import { WorkspaceFaviconRepository } from '../repositories/workspace-favicon.repo';
import { HookContext } from '../../../../core/plugins/plugin-hooks';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { validFaviconExtensions } from '../../../../core/attachment/attachment.constants';
import { parse } from 'node:path';

export const WORKSPACE_FAVICON_TYPE = 'workspace-favicon';

@Injectable()
export class FaviconUploadHandler {
  private readonly logger = new Logger(FaviconUploadHandler.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly workspaceFaviconRepo: WorkspaceFaviconRepository,
    private readonly attachmentRepo: AttachmentRepo,
  ) {}

  async handle(context: HookContext): Promise<HookContext> {
    const { type, workspaceId, fileName } = context;

    if (type !== WORKSPACE_FAVICON_TYPE) {
      return context;
    }

    try {
      // Validate file extension
      const ext = parse(fileName).ext.toLowerCase();
      if (!validFaviconExtensions.includes(ext)) {
        throw new BadRequestException(
          `Invalid favicon format. Allowed formats: ${validFaviconExtensions.join(', ')}`,
        );
      }
      // Get old favicon filename to delete later
      const workspace = await this.workspaceFaviconRepo.getWorkspace(workspaceId);
      const oldFileName = workspace?.favicon;

      // Update workspace with new favicon
      await this.workspaceFaviconRepo.updateWorkspaceFavicon(workspaceId, fileName);

      // Delete old favicon if exists
      if (oldFileName && !oldFileName.toLowerCase().startsWith('http')) {
        const oldFilePath = `${workspaceId}/workspace-favicons/${oldFileName}`;
        try {
          await this.storageService.delete(oldFilePath);
          await this.attachmentRepo.deleteAttachmentByFilePath(oldFilePath);
        } catch (err) {
          this.logger.warn(`Failed to delete old favicon: ${oldFileName}`, err);
        }
      }

      return { ...context, handled: true };
    } catch (err) {
      this.logger.error(`Failed to upload favicon for workspace ${workspaceId}:`, err);
      throw new BadRequestException('Failed to upload favicon');
    }
  }
}
