import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AttachmentMetadata } from '../types';

@Injectable()
export class AttachmentRepository {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createAttachment(data: Omit<AttachmentMetadata, 'id' | 'createdAt'>): Promise<AttachmentMetadata> {
    const result = await this.db
      .insertInto('attachments' as any)
      .values({
        workspace_id: data.workspaceId,
        page_id: data.pageId,
        subpage_id: data.subpageId,
        filename: data.filename,
        file_extension: data.fileExtension,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        minio_bucket: data.minioBucket,
        minio_path: data.minioPath,
        minio_version_id: data.minioVersionId,
        minio_etag: data.minioEtag,
        minio_last_modified: data.minioLastModified,
        page_slug: data.pageSlug,
        subpage_slug: data.subpageSlug,
        created_by: data.createdBy,
        needs_resync: data.needsResync,
        retry_count: data.retryCount,
        download_count: data.downloadCount,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAttachmentMetadata(result);
  }

  async getAttachmentById(id: string, workspaceId: string): Promise<AttachmentMetadata | null> {
    const result = await this.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('id' as any, '=', id)
      .where('workspace_id' as any, '=', workspaceId)
      .where('hard_deleted_at' as any, 'is', null)
      .executeTakeFirst();

    return result ? this.mapToAttachmentMetadata(result) : null;
  }

  async listAttachmentsByPage(
    pageId: string,
    workspaceId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ attachments: AttachmentMetadata[]; total: number }> {
    const query = this.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('page_id' as any, '=', pageId)
      .where('workspace_id' as any, '=', workspaceId)
      .where('soft_delete_at' as any, 'is', null)
      .where('hard_deleted_at' as any, 'is', null)
      .orderBy('created_at' as any, 'desc');

    const countResult = await query
      .select((db: any) => db.fn.count('id').as('count'))
      .executeTakeFirst();

    const total = countResult?.count || 0;

    const attachments = await query
      .limit(limit)
      .offset(offset)
      .execute()
      .then((rows: any[]) => rows.map(this.mapToAttachmentMetadata));

    return { attachments, total };
  }

  async softDeleteAttachment(id: string, workspaceId: string, deletedBy: string): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        soft_delete_at: new Date(),
        deleted_by: deletedBy,
      } as any)
      .where('id' as any, '=', id)
      .where('workspace_id' as any, '=', workspaceId)
      .execute();
  }

  async hardDeleteAttachment(id: string): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        hard_deleted_at: new Date(),
      } as any)
      .where('id' as any, '=', id)
      .execute();
  }

  async updateAttachmentPath(
    id: string,
    newMinioPath: string,
    newPageSlug: string,
    newSubpageSlug?: string,
  ): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        minio_path: newMinioPath,
        page_slug: newPageSlug,
        subpage_slug: newSubpageSlug || null,
        needs_resync: true,
      } as any)
      .where('id' as any, '=', id)
      .execute();
  }

  async markSynced(id: string): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        needs_resync: false,
        last_sync_at: new Date(),
        error_message: null,
      } as any)
      .where('id' as any, '=', id)
      .execute();
  }

  async markSyncFailed(id: string, errorMessage: string): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        error_message: errorMessage,
      } as any)
      .where('id' as any, '=', id)
      .execute();
  }

  async findSoftDeletedOlderThan(workspaceId: string, days: number): Promise<AttachmentMetadata[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await this.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('workspace_id' as any, '=', workspaceId)
      .where('soft_delete_at' as any, '<', cutoffDate)
      .where('hard_deleted_at' as any, 'is', null)
      .execute();

    return results.map(this.mapToAttachmentMetadata);
  }

  async findNeedingResync(workspaceId: string, limit: number = 100): Promise<AttachmentMetadata[]> {
    const results = await this.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('workspace_id' as any, '=', workspaceId)
      .where('needs_resync' as any, '=', true)
      .where('soft_delete_at' as any, 'is', null)
      .limit(limit)
      .execute();

    return results.map(this.mapToAttachmentMetadata);
  }

  async findByPageId(pageId: string, workspaceId: string): Promise<AttachmentMetadata[]> {
    const results = await this.db
      .selectFrom('attachments' as any)
      .selectAll()
      .where('page_id' as any, '=', pageId)
      .where('workspace_id' as any, '=', workspaceId)
      .where('soft_delete_at' as any, 'is', null)
      .where('hard_deleted_at' as any, 'is', null)
      .execute();

    return results.map(this.mapToAttachmentMetadata);
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await this.db
      .updateTable('attachments' as any)
      .set({
        download_count: (db: any) => db.raw('download_count + 1'),
      } as any)
      .where('id' as any, '=', id)
      .execute();
  }

  private mapToAttachmentMetadata(row: any): AttachmentMetadata {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      pageId: row.page_id,
      subpageId: row.subpage_id,
      filename: row.filename,
      fileExtension: row.file_extension,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      minioBucket: row.minio_bucket,
      minioPath: row.minio_path,
      minioVersionId: row.minio_version_id,
      minioEtag: row.minio_etag,
      minioLastModified: row.minio_last_modified,
      pageSlug: row.page_slug,
      subpageSlug: row.subpage_slug,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      softDeleteAt: row.soft_delete_at,
      hardDeletedAt: row.hard_deleted_at,
      needsResync: row.needs_resync,
      lastSyncAt: row.last_sync_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      downloadCount: row.download_count,
    };
  }
}
