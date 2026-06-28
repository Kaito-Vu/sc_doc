import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MinioClientService } from '../services/minio-client.service';
import { MinioSettingsRepository } from '../repositories/minio-settings.repository';
import { MinioConfig } from '../types';

@Processor('minio-queue')
export class MinioMigrationProcessor extends WorkerHost {
  private readonly logger = new Logger(MinioMigrationProcessor.name);

  constructor(
    private readonly minioClient: MinioClientService,
    private readonly settingsRepo: MinioSettingsRepository,
  ) {
    super();
  }

  async process(
    job: Job,
  ): Promise<{ success: boolean; migratedCount: number } | void> {
    if (job.name !== 'migrate-objects') {
      return;
    }

    return this.migrateObjects(job);
  }

  private async migrateObjects(
    job: Job,
  ): Promise<{ success: boolean; migratedCount: number }> {
    const {
      workspaceId,
      oldEndpoint,
      newEndpoint,
      useSSL,
      accessKey,
      secretKey,
      bucketName,
    } = job.data;

    this.logger.log(
      `Starting migration for workspace ${workspaceId} from ${oldEndpoint} to ${newEndpoint}`,
    );

    try {
      const oldConfig: MinioConfig = {
        endpoint: oldEndpoint,
        accessKey: job.data.oldAccessKey || '',
        secretKey: job.data.oldSecretKey || '',
        useSSL: job.data.oldUseSSL || false,
      };

      const newConfig: MinioConfig = {
        endpoint: newEndpoint,
        accessKey,
        secretKey,
        useSSL,
      };

      const oldClient = this.minioClient.getOrCreateClient(
        `${workspaceId}-old`,
        oldConfig,
      );
      const newClient = this.minioClient.getOrCreateClient(
        `${workspaceId}-new`,
        newConfig,
      );

      let migratedCount = 0;
      let failedCount = 0;
      const startTime = Date.now();

      const objectsStream = await this.minioClient.listObjectsStream(
        oldClient,
        bucketName,
      );

      for await (const obj of objectsStream) {
        try {
          const objectStream = await this.minioClient.getObject(
            oldClient,
            bucketName,
            obj.name,
            obj.versionId,
          );

          await this.minioClient.putObject(
            newClient,
            bucketName,
            obj.name,
            objectStream,
            obj.size,
          );

          migratedCount++;

          const progress = Math.round(
            (migratedCount / job.data.totalFiles) * 100,
          );
          const elapsedMs = Date.now() - startTime;
          const avgTimePerObject = elapsedMs / migratedCount;
          const remainingObjects = (job.data.totalFiles || 1) - migratedCount;
          const etaMs = avgTimePerObject * remainingObjects;
          const eta = new Date(Date.now() + etaMs);

          await this.settingsRepo.updateMigrationStatus(
            workspaceId,
            'in_progress',
            progress,
            migratedCount,
            eta,
          );

          await job.updateProgress(progress);
        } catch (error) {
          failedCount++;
          this.logger.error(
            `Failed to migrate object ${obj.name}: ${error instanceof Error ? error.message : String(error)}`,
          );

          if (failedCount > 10) {
            throw new Error(
              `Too many migration failures (${failedCount}), stopping migration`,
            );
          }
        }
      }

      await this.settingsRepo.completeMigration(workspaceId);
      this.minioClient.removeClient(`${workspaceId}-old`);
      this.minioClient.removeClient(`${workspaceId}-new`);
      this.logger.log(
        `Migration completed for workspace ${workspaceId}. Migrated ${migratedCount} objects`,
      );

      return { success: true, migratedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Migration failed for workspace ${workspaceId}: ${errorMsg}`,
      );

      await this.settingsRepo.failMigration(workspaceId, errorMsg);
      this.minioClient.removeClient(`${workspaceId}-old`);
      this.minioClient.removeClient(`${workspaceId}-new`);
      throw error;
    }
  }
}
