import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { MinioClientService } from './minio-client.service';
import { MinioSettingsRepository } from '../repositories/minio-settings.repository';
import { MinioEncryptionService } from './minio-encryption.service';
import { WorkspaceMinioSettings, MinioConfig } from '../types';

@Injectable()
export class MinioSettingsService {
  private readonly logger = new Logger(MinioSettingsService.name);

  constructor(
    private readonly minioClient: MinioClientService,
    private readonly settingsRepo: MinioSettingsRepository,
    private readonly encryptionService: MinioEncryptionService,
  ) {}

  async getSettings(workspaceId: string): Promise<WorkspaceMinioSettings | null> {
    return this.settingsRepo.getSettings(workspaceId);
  }

  async updateSettings(
    workspaceId: string,
    minioEndpoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    minioUseSsl: boolean = false,
    gcSoftDeleteGraceDays: number = 30,
    gcVersionRetentionDays: number = 90,
  ): Promise<WorkspaceMinioSettings> {
    // Validate and test connection
    const bucketName = this.normalizeBucketName(workspaceId);
    const config: MinioConfig = {
      endpoint: minioEndpoint,
      accessKey: minioAccessKey,
      secretKey: minioSecretKey,
      useSSL: minioUseSsl,
    };

    const client = this.minioClient.getOrCreateClient(workspaceId, config);

    // Test connection
    const isHealthy = await this.minioClient.health(client);
    if (!isHealthy) {
      this.minioClient.removeClient(workspaceId);
      throw new BadRequestException('Cannot connect to MinIO with provided credentials');
    }

    // Create or verify bucket
    try {
      const exists = await this.minioClient.bucketExists(client, bucketName);
      if (exists) {
        await this.minioClient.enableVersioning(client, bucketName);
      } else {
        await this.minioClient.createBucket(client, bucketName);
        await this.minioClient.enableVersioning(client, bucketName);
        this.logger.log(`Created bucket ${bucketName} with versioning enabled`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize bucket: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(`Failed to initialize MinIO bucket: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Encrypt secret key before storing
    const encryptedSecretKey = this.encryptionService.encrypt(minioSecretKey);

    // Save settings
    const settings = await this.settingsRepo.createOrUpdateSettings(workspaceId, {
      minioEndpoint,
      minioAccessKey,
      minioSecretKey,
      minioUseSsl,
      minioBucketName: bucketName,
      gcSoftDeleteGraceDays,
      gcVersionRetentionDays,
      isConfigured: true,
      isEnabled: true,
      healthStatus: 'healthy',
      encryptedSecretKey,
    });

    await this.settingsRepo.updateBucketCreated(workspaceId);

    return settings;
  }

  async checkHealth(workspaceId: string): Promise<{ status: string; message?: string }> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      return {
        status: 'unconfigured',
        message: 'MinIO not configured for this workspace',
      };
    }

    const config: MinioConfig = {
      endpoint: settings.minioEndpoint,
      accessKey: settings.minioAccessKey,
      secretKey: settings.minioSecretKey,
      useSSL: settings.minioUseSsl,
    };

    const client = this.minioClient.getOrCreateClient(workspaceId, config);

    try {
      const isHealthy = await this.minioClient.health(client);
      if (isHealthy) {
        await this.settingsRepo.updateHealth(workspaceId, 'healthy');
        return { status: 'healthy' };
      } else {
        await this.settingsRepo.updateHealth(workspaceId, 'degraded', 'Health check failed');
        return { status: 'degraded', message: 'Health check failed' };
      }
    } catch (error) {
      await this.settingsRepo.updateHealth(workspaceId, 'unreachable', error instanceof Error ? error.message : String(error));
      return {
        status: 'unreachable',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStorageUsage(workspaceId: string): Promise<number> {
    const settings = await this.settingsRepo.getSettings(workspaceId);
    if (!settings?.isConfigured) {
      return 0;
    }

    const config: MinioConfig = {
      endpoint: settings.minioEndpoint,
      accessKey: settings.minioAccessKey,
      secretKey: settings.minioSecretKey,
      useSSL: settings.minioUseSsl,
    };

    try {
      const client = this.minioClient.getOrCreateClient(workspaceId, config);
      const size = await this.minioClient.getBucketSize(client, settings.minioBucketName);
      return size;
    } catch (error) {
      this.logger.error(`Failed to get bucket size: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  private normalizeBucketName(workspaceId: string): string {
    // Bucket names must be lowercase, alphanumeric, and hyphens
    return workspaceId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .substring(0, 63)
      .replace(/^-|-$/g, '');
  }
}
