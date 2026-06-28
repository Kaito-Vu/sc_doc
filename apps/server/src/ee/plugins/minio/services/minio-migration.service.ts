import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MinioSettingsRepository } from '../repositories/minio-settings.repository';
import { MinioClientService } from './minio-client.service';
import { MinioConfig } from '../types';

@Injectable()
export class MinioMigrationService {
  private readonly logger = new Logger(MinioMigrationService.name);

  constructor(
    private readonly settingsRepo: MinioSettingsRepository,
    private readonly minioClient: MinioClientService,
    @InjectQueue('minio-queue') private readonly migrationQueue: Queue,
  ) {}

  async startMigration(
    workspaceId: string,
    newEndpoint: string,
    useSSL: boolean,
    accessKey: string,
    secretKey: string,
  ): Promise<{ jobId: string }> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings) {
      throw new BadRequestException('MinIO not configured');
    }

    if (settings.migrationStatus === 'in_progress') {
      throw new BadRequestException('Migration already in progress');
    }

    // Test new connection
    const newConfig: MinioConfig = {
      endpoint: newEndpoint,
      accessKey,
      secretKey,
      useSSL,
    };

    const newClient = this.minioClient.getOrCreateClient(workspaceId, newConfig);
    const isHealthy = await this.minioClient.health(newClient);
    if (!isHealthy) {
      this.minioClient.removeClient(workspaceId);
      throw new BadRequestException('Cannot connect to new MinIO host');
    }

    // Get total object count from current host
    const oldConfig: MinioConfig = {
      endpoint: settings.minioEndpoint,
      accessKey: settings.minioAccessKey,
      secretKey: settings.minioSecretKey,
      useSSL: settings.minioUseSsl,
    };

    const oldClient = this.minioClient.getOrCreateClient(`${workspaceId}-old`, oldConfig);

    let totalFiles = 0;
    try {
      const stream = await this.minioClient.listObjectsStream(oldClient, settings.minioBucketName);
      for await (const _ of stream) {
        totalFiles++;
      }
    } catch (error) {
      this.logger.error(`Failed to count objects: ${error instanceof Error ? error.message : String(error)}`);
      totalFiles = 0;
    }

    this.minioClient.removeClient(`${workspaceId}-old`);

    // Start migration
    await this.settingsRepo.startMigration(workspaceId, newEndpoint, totalFiles || 1);

    // Queue migration job
    const job = await this.migrationQueue.add(
      'migrate-objects',
      {
        workspaceId,
        oldEndpoint: settings.minioEndpoint,
        oldAccessKey: settings.minioAccessKey,
        oldSecretKey: settings.minioSecretKey,
        oldUseSSL: settings.minioUseSsl,
        newEndpoint,
        useSSL,
        accessKey,
        secretKey,
        bucketName: settings.minioBucketName,
        totalFiles: totalFiles || 1,
      },
      {
        jobId: `migration-${workspaceId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: { age: 3600 },
      },
    );

    return { jobId: job.id || '' };
  }

  async getMigrationStatus(workspaceId: string): Promise<{
    status: 'idle' | 'in_progress' | 'completed' | 'failed';
    progress: number;
    processedFiles: number;
    totalFiles: number;
    eta?: Date;
    error?: string;
    remainingTime?: string;
  }> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings) {
      return {
        status: 'idle',
        progress: 0,
        processedFiles: 0,
        totalFiles: 0,
      };
    }

    const remaining = settings.migrationEta
      ? this.calculateRemainingTime(settings.migrationEta)
      : undefined;

    return {
      status: settings.migrationStatus || 'idle',
      progress: settings.migrationProgress || 0,
      processedFiles: settings.migrationProcessedFiles || 0,
      totalFiles: settings.migrationTotalFiles || 0,
      eta: settings.migrationEta,
      error: settings.migrationError,
      remainingTime: remaining,
    };
  }

  async cancelMigration(workspaceId: string): Promise<void> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (settings?.migrationStatus !== 'in_progress') {
      throw new BadRequestException('No migration in progress');
    }

    // Remove any pending migration job
    const jobs = await this.migrationQueue.getJobs(['delayed', 'waiting']);
    for (const job of jobs) {
      if (job.data.workspaceId === workspaceId) {
        await job.remove();
      }
    }

    // Revert to old endpoint
    await this.settingsRepo.updateMigrationStatus(workspaceId, 'idle', 0, 0);
    await this.settingsRepo.rollbackMigration(workspaceId);
  }

  async rollback(workspaceId: string): Promise<void> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.lastSuccessfulHost) {
      throw new BadRequestException('No previous host to rollback to');
    }

    await this.settingsRepo.rollbackMigration(workspaceId);
  }

  private calculateRemainingTime(eta: Date): string {
    const now = new Date();
    const diff = eta.getTime() - now.getTime();

    if (diff <= 0) {
      return 'Completed';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `~${hours}h ${minutes}m remaining`;
    }
    return `~${minutes}m remaining`;
  }
}
