import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from './minio-client.service';
import { AttachmentRepository } from '../repositories/attachment.repository';
import { MinioSettingsRepository } from '../repositories/minio-settings.repository';
import { AttachmentMetadata, UploadAttachmentRequest, MinioConfig, WorkspaceMinioSettings } from '../types';

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    private readonly minioClient: MinioClientService,
    private readonly attachmentRepo: AttachmentRepository,
    private readonly settingsRepo: MinioSettingsRepository,
  ) {}

  async uploadAttachment(
    workspaceId: string,
    userId: string,
    request: UploadAttachmentRequest & { pageSlug: string; subpageSlug?: string },
  ): Promise<AttachmentMetadata> {
    // Validate settings exist and are configured
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      throw new BadRequestException('MinIO storage not configured for this workspace');
    }

    // Validate file
    this.validateFile(request.filename, request.mimeType);

    // Generate MinIO path
    const fileUuid = uuidv4();
    const minioPath = this.buildMinioPath(
      request.pageSlug,
      request.subpageSlug,
      request.filename,
      fileUuid,
    );

    // Upload to MinIO
    const client = this.minioClient.getOrCreateClient(workspaceId, this.parseConfig(settings));
    const uploadResult = await this.minioClient.putObject(
      client,
      settings.minioBucketName,
      minioPath,
      request.file,
      request.file.length,
    );

    // Save to database
    const attachment = await this.attachmentRepo.createAttachment({
      workspaceId,
      pageId: request.pageId,
      subpageId: request.subpageId,
      filename: request.filename,
      fileExtension: request.filename.split('.').pop() || '',
      mimeType: request.mimeType,
      fileSize: request.file.length,
      minioBucket: settings.minioBucketName,
      minioPath,
      minioVersionId: uploadResult.versionId || '',
      minioEtag: uploadResult.etag,
      minioLastModified: new Date(),
      pageSlug: request.pageSlug,
      subpageSlug: request.subpageSlug,
      createdBy: userId,
      needsResync: false,
      retryCount: 0,
      downloadCount: 0,
    });

    this.logger.log(
      `Attachment uploaded: ${attachment.id} (${request.filename}) to workspace ${workspaceId}`,
    );

    return attachment;
  }

  async downloadAttachment(
    attachmentId: string,
    workspaceId: string,
    versionId?: string,
  ): Promise<Buffer> {
    const attachment = await this.attachmentRepo.getAttachmentById(attachmentId, workspaceId);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      throw new BadRequestException('MinIO storage not configured');
    }

    const client = this.minioClient.getOrCreateClient(workspaceId, this.parseConfig(settings));

    try {
      const stream = await this.minioClient.getObject(
        client,
        settings.minioBucketName,
        attachment.minioPath,
        versionId || attachment.minioVersionId,
      );

      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          this.attachmentRepo.incrementDownloadCount(attachmentId).catch((err) =>
            this.logger.error(`Failed to increment download count: ${err.message}`),
          );
          resolve(Buffer.concat(chunks));
        });
        stream.on('error', (err) => reject(err));
      });
    } catch (error) {
      this.logger.error(`Failed to download attachment: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async deleteAttachment(attachmentId: string, workspaceId: string, userId: string): Promise<void> {
    const attachment = await this.attachmentRepo.getAttachmentById(attachmentId, workspaceId);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      throw new BadRequestException('MinIO storage not configured');
    }

    const client = this.minioClient.getOrCreateClient(workspaceId, this.parseConfig(settings));

    // Delete all versions from MinIO
    try {
      const deletedCount = await this.minioClient.removeAllVersions(
        client,
        settings.minioBucketName,
        attachment.minioPath,
      );
      this.logger.log(`Deleted ${deletedCount} versions of ${attachment.minioPath}`);
    } catch (error) {
      this.logger.error(`Failed to delete from MinIO: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    // Soft delete in database
    await this.attachmentRepo.softDeleteAttachment(attachmentId, workspaceId, userId);
    this.logger.log(`Attachment soft-deleted: ${attachmentId}`);
  }

  async syncPageRename(
    workspaceId: string,
    pageId: string,
    oldSlug: string,
    newSlug: string,
    oldSubSlug?: string,
    newSubSlug?: string,
  ): Promise<void> {
    const attachments = await this.attachmentRepo.findByPageId(pageId, workspaceId);

    if (attachments.length === 0) {
      return;
    }

    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      this.logger.warn(`MinIO not configured for workspace ${workspaceId}, skipping sync`);
      return;
    }

    const client = this.minioClient.getOrCreateClient(workspaceId, this.parseConfig(settings));

    for (const attachment of attachments) {
      await this.syncAttachmentOnPageRename(attachment, client, settings, newSlug, newSubSlug);
    }
  }

  private async syncAttachmentOnPageRename(
    attachment: AttachmentMetadata,
    client: any,
    settings: WorkspaceMinioSettings,
    newSlug: string,
    newSubSlug?: string,
  ): Promise<void> {
    try {
      const newMinioPath = this.buildMinioPath(
        newSlug,
        newSubSlug || attachment.subpageSlug,
        attachment.filename,
        attachment.minioVersionId.split('_')[1] || uuidv4(),
      );

      await this.minioClient.copyObject(
        client,
        settings.minioBucketName,
        attachment.minioPath,
        settings.minioBucketName,
        newMinioPath,
      );

      await this.attachmentRepo.updateAttachmentPath(
        attachment.id,
        newMinioPath,
        newSlug,
        newSubSlug,
      );

      await this.removeOldMinioPath(client, settings.minioBucketName, attachment.minioPath);
    } catch (error) {
      this.logger.error(
        `Failed to sync attachment ${attachment.id} during page rename: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.attachmentRepo.markSyncFailed(attachment.id, error instanceof Error ? error.message : String(error));
    }
  }

  private async removeOldMinioPath(client: any, bucketName: string, oldPath: string): Promise<void> {
    try {
      await this.minioClient.removeAllVersions(client, bucketName, oldPath);
    } catch (error) {
      this.logger.warn(`Failed to delete old path ${oldPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async hardDeleteOldAttachments(workspaceId: string): Promise<void> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings) {
      return;
    }

    const attachments = await this.attachmentRepo.findSoftDeletedOlderThan(
      workspaceId,
      settings.gcSoftDeleteGraceDays,
    );

    for (const attachment of attachments) {
      try {
        await this.attachmentRepo.hardDeleteAttachment(attachment.id);
        this.logger.log(`Hard-deleted attachment: ${attachment.id}`);
      } catch (error) {
        this.logger.error(`Failed to hard-delete attachment ${attachment.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.settingsRepo.updateGCLastRun(workspaceId);
  }

  async listByPage(
    pageId: string,
    workspaceId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ attachments: AttachmentMetadata[]; total: number }> {
    return this.attachmentRepo.listAttachmentsByPage(pageId, workspaceId, limit, offset);
  }

  async reconcile(workspaceId: string): Promise<void> {
    const attachments = await this.attachmentRepo.findNeedingResync(workspaceId);

    for (const attachment of attachments) {
      try {
        const settings = await this.settingsRepo.getSettings(workspaceId);
        if (!settings?.isConfigured) {
          continue;
        }

        const client = this.minioClient.getOrCreateClient(workspaceId, this.parseConfig(settings));
        const stat = await this.minioClient.statObject(
          client,
          settings.minioBucketName,
          attachment.minioPath,
        );

        if (stat) {
          await this.attachmentRepo.markSynced(attachment.id);
        } else {
          await this.attachmentRepo.markSyncFailed(attachment.id, 'Object not found in MinIO');
        }
      } catch (error) {
        this.logger.error(`Reconciliation failed for attachment ${attachment.id}: ${error instanceof Error ? error.message : String(error)}`);
        await this.attachmentRepo.markSyncFailed(attachment.id, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private buildMinioPath(
    pageSlug: string,
    subpageSlug: string | undefined,
    filename: string,
    uuid: string,
  ): string {
    const sanitizedFilename = filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\./, '_');
    const fileExt = filename.split('.').pop() || '';

    const parts = [pageSlug];
    if (subpageSlug) {
      parts.push(subpageSlug);
    }
    parts.push(`${sanitizedFilename}_${uuid}.${fileExt}`);

    return parts.join('/');
  }

  private validateFile(filename: string, mimeType: string): void {
    if (!filename || filename.length > 255) {
      throw new BadRequestException('Invalid filename');
    }

    const allowedTypes = process.env.MINIO_ALLOWED_MIME_TYPES?.split(',') || [
      'image/*',
      'application/pdf',
      'text/*',
    ];
    const isAllowed = allowedTypes.some((type) => {
      if (type.includes('*')) {
        const prefix = type.split('*')[0];
        return mimeType.startsWith(prefix);
      }
      return mimeType === type;
    });

    if (!isAllowed) {
      throw new BadRequestException(`File type ${mimeType} not allowed`);
    }
  }

  private parseConfig(settings: any): MinioConfig {
    return {
      endpoint: settings.minioEndpoint,
      accessKey: settings.minioAccessKey,
      secretKey: settings.minioSecretKey,
      useSSL: settings.minioUseSsl || false,
    };
  }
}
