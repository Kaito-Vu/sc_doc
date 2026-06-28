import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { WorkspaceMinioSettings } from '../types';

@Injectable()
export class MinioSettingsRepository {
  constructor(@InjectKysely() private db: KyselyDB) {}

  async getSettings(workspaceId: string): Promise<WorkspaceMinioSettings | null> {
    const result = await this.db
      .selectFrom('workspace_minio_settings' as any)
      .selectAll()
      .where('workspace_id' as any, '=', workspaceId)
      .executeTakeFirst();

    return result ? this.mapToSettings(result) : null;
  }

  async createOrUpdateSettings(workspaceId: string, data: Partial<WorkspaceMinioSettings>): Promise<WorkspaceMinioSettings> {
    const existing = await this.getSettings(workspaceId);

    if (existing) {
      const result = await this.db
        .updateTable('workspace_minio_settings' as any)
        .set({
          minio_endpoint: data.minioEndpoint,
          minio_access_key: data.minioAccessKey,
          minio_secret_key: data.minioSecretKey,
          minio_use_ssl: data.minioUseSsl,
          minio_bucket_name: data.minioBucketName,
          gc_soft_delete_grace_days: data.gcSoftDeleteGraceDays,
          gc_version_retention_days: data.gcVersionRetentionDays,
          is_configured: data.isConfigured,
          is_enabled: data.isEnabled,
          health_status: data.healthStatus,
          health_message: data.healthMessage,
          updated_at: new Date(),
        } as any)
        .where('workspace_id' as any, '=', workspaceId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToSettings(result);
    } else {
      const result = await this.db
        .insertInto('workspace_minio_settings' as any)
        .values({
          workspace_id: workspaceId,
          minio_endpoint: data.minioEndpoint,
          minio_access_key: data.minioAccessKey,
          minio_secret_key: data.minioSecretKey,
          minio_use_ssl: data.minioUseSsl || false,
          minio_bucket_name: data.minioBucketName,
          gc_soft_delete_grace_days: data.gcSoftDeleteGraceDays || 30,
          gc_version_retention_days: data.gcVersionRetentionDays || 90,
          is_configured: data.isConfigured || false,
          is_enabled: data.isEnabled || true,
        } as any)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToSettings(result);
    }
  }

  async updateHealth(workspaceId: string, status: string, message?: string): Promise<void> {
    await this.db
      .updateTable('workspace_minio_settings' as any)
      .set({
        health_status: status,
        health_message: message,
        health_check_at: new Date(),
      } as any)
      .where('workspace_id' as any, '=', workspaceId)
      .execute();
  }

  async updateBucketCreated(workspaceId: string): Promise<void> {
    await this.db
      .updateTable('workspace_minio_settings' as any)
      .set({
        bucket_created_at: new Date(),
        is_configured: true,
      } as any)
      .where('workspace_id' as any, '=', workspaceId)
      .execute();
  }

  async updateGCLastRun(workspaceId: string): Promise<void> {
    await this.db
      .updateTable('workspace_minio_settings' as any)
      .set({
        gc_last_run_at: new Date(),
      } as any)
      .where('workspace_id' as any, '=', workspaceId)
      .execute();
  }

  async getAllEnabledSettings(): Promise<WorkspaceMinioSettings[]> {
    const results = await this.db
      .selectFrom('workspace_minio_settings' as any)
      .selectAll()
      .where('is_enabled' as any, '=', true)
      .execute();

    return results.map(this.mapToSettings);
  }

  private mapToSettings(row: any): WorkspaceMinioSettings {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      minioEndpoint: row.minio_endpoint,
      minioAccessKey: row.minio_access_key,
      minioSecretKey: row.minio_secret_key,
      minioUseSsl: row.minio_use_ssl,
      minioBucketName: row.minio_bucket_name,
      bucketCreatedAt: row.bucket_created_at,
      gcSoftDeleteGraceDays: row.gc_soft_delete_grace_days,
      gcVersionRetentionDays: row.gc_version_retention_days,
      gcLastRunAt: row.gc_last_run_at,
      isEnabled: row.is_enabled,
      isConfigured: row.is_configured,
      healthStatus: row.health_status,
      healthMessage: row.health_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
