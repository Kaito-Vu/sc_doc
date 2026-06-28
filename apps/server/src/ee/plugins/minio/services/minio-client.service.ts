import { Injectable, Logger } from '@nestjs/common';
import { MinioConfig } from '../types';

// MinIO client is loaded dynamically at runtime
type MinioClient = any;
let MinioModule: any = null;

@Injectable()
export class MinioClientService {
  private clients: Map<string, MinioClient> = new Map();
  private logger = new Logger(MinioClientService.name);

  private async ensureMinioLoaded(): Promise<void> {
    if (!MinioModule) {
      try {
        // Dynamically load minio at runtime
        MinioModule = require('minio');
      } catch (error) {
        this.logger.error('MinIO client not available. Please install: npm install minio');
        throw new Error('MinIO client library not found');
      }
    }
  }

  getOrCreateClient(workspaceId: string, config: MinioConfig): MinioClient {
    const key = `${workspaceId}`;

    if (this.clients.has(key)) {
      return this.clients.get(key)!;
    }

    if (!MinioModule || !MinioModule.Client) {
      throw new Error('MinIO client not initialized. Call ensureMinioLoaded first.');
    }

    const client = new MinioModule.Client({
      endPoint: config.endpoint.split(':')[0],
      port: parseInt(config.endpoint.split(':')[1] || (config.useSSL ? '443' : '9000'), 10),
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
    });

    this.clients.set(key, client);
    return client;
  }

  removeClient(workspaceId: string): void {
    this.clients.delete(workspaceId);
  }

  async health(client: MinioClient): Promise<boolean> {
    try {
      await client.listBuckets();
      return true;
    } catch (error) {
      this.logger.error(`MinIO health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async bucketExists(client: MinioClient, bucketName: string): Promise<boolean> {
    try {
      return await client.bucketExists(bucketName);
    } catch (error) {
      this.logger.error(`Failed to check bucket existence: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async createBucket(client: MinioClient, bucketName: string): Promise<void> {
    try {
      const exists = await this.bucketExists(client, bucketName);
      if (!exists) {
        await client.makeBucket(bucketName, 'us-east-1');
        this.logger.log(`Created bucket: ${bucketName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create bucket: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async enableVersioning(client: MinioClient, bucketName: string): Promise<void> {
    try {
      // MinIO versioning is enabled via bucket policy
      const versioningConfig = {
        Status: 'Enabled',
      };
      await client.setBucketVersioning(bucketName, versioningConfig);
      this.logger.log(`Enabled versioning for bucket: ${bucketName}`);
    } catch (error) {
      // If versioning is not supported, log warning but continue
      this.logger.warn(`Failed to enable versioning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async putObject(
    client: MinioClient,
    bucketName: string,
    objectName: string,
    stream: Buffer | NodeJS.ReadableStream,
    size?: number,
  ): Promise<{ versionId?: string; etag?: string }> {
    try {
      const result = await client.putObject(bucketName, objectName, stream, size);
      return {
        versionId: result?.versionId,
        etag: result?.etag,
      };
    } catch (error) {
      this.logger.error(`Failed to put object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getObject(
    client: MinioClient,
    bucketName: string,
    objectName: string,
    versionId?: string,
  ): Promise<NodeJS.ReadableStream> {
    try {
      return await client.getObject(bucketName, objectName, { versionId });
    } catch (error) {
      this.logger.error(`Failed to get object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async removeObject(
    client: MinioClient,
    bucketName: string,
    objectName: string,
    versionId?: string,
  ): Promise<void> {
    try {
      if (versionId) {
        await client.removeObject(bucketName, objectName, { versionId });
      } else {
        await client.removeObject(bucketName, objectName);
      }
      this.logger.debug(`Removed object: ${bucketName}/${objectName}${versionId ? ` (${versionId})` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to remove object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async removeAllVersions(
    client: MinioClient,
    bucketName: string,
    objectName: string,
  ): Promise<number> {
    try {
      let deletedCount = 0;

      // List all versions
      const objectsStream = await client.listObjectsV2(bucketName, objectName, true);

      for await (const obj of objectsStream) {
        if (obj.name === objectName) {
          await client.removeObject(bucketName, objectName, {
            versionId: obj?.versionId,
          });
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to remove all versions: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async copyObject(
    client: MinioClient,
    sourceBucket: string,
    sourceObject: string,
    destBucket: string,
    destObject: string,
  ): Promise<void> {
    try {
      await client.copyObject(destBucket, destObject, `${sourceBucket}/${sourceObject}`);
      this.logger.debug(`Copied object: ${sourceBucket}/${sourceObject} → ${destBucket}/${destObject}`);
    } catch (error) {
      this.logger.error(`Failed to copy object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async statObject(
    client: MinioClient,
    bucketName: string,
    objectName: string,
  ): Promise<any | null> {
    try {
      return await client.statObject(bucketName, objectName);
    } catch (error) {
      if ((error as any)?.code === 'NotFound') {
        return null;
      }
      this.logger.error(`Failed to stat object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async listObjects(
    client: MinioClient,
    bucketName: string,
    prefix?: string,
    recursive: boolean = false,
  ): Promise<any[]> {
    try {
      const objects: any[] = [];
      const objectsStream = client.listObjects(bucketName, prefix, recursive);

      for await (const obj of objectsStream) {
        objects.push(obj);
      }

      return objects;
    } catch (error) {
      this.logger.error(`Failed to list objects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getBucketSize(
    client: MinioClient,
    bucketName: string,
  ): Promise<number> {
    try {
      const objects = await this.listObjects(client, bucketName, '', true);
      return objects.reduce((total, obj) => total + obj.size, 0);
    } catch (error) {
      this.logger.error(`Failed to get bucket size: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
