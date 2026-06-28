import { Injectable, Logger } from '@nestjs/common';
import { MinioConfig, MinioObjectStat } from '../types';

// MinIO client is loaded dynamically at runtime
let MinioModule: any = null;

@Injectable()
export class MinioClientService {
  private readonly clients: Map<string, any> = new Map();
  private readonly logger = new Logger(MinioClientService.name);

  private async ensureMinioLoaded(): Promise<void> {
    if (!MinioModule) {
      try {
        // Dynamically load minio at runtime
        MinioModule = require('minio');
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`MinIO client not available. Please install: npm install minio (${detail})`);
        throw new Error(`MinIO client library not found: ${detail}`);
      }
    }
  }

  getOrCreateClient(workspaceId: string, config: MinioConfig): any {
    const key = `${workspaceId}`;

    if (this.clients.has(key)) {
      return this.clients.get(key)!;
    }

    if (!MinioModule?.Client) {
      throw new Error('MinIO client not initialized. Call ensureMinioLoaded first.');
    }

    const client = new MinioModule.Client({
      endPoint: config.endpoint.split(':')[0],
      port: Number.parseInt(config.endpoint.split(':')[1] || (config.useSSL ? '443' : '9000'), 10),
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

  async health(client: any): Promise<boolean> {
    try {
      await client.listBuckets();
      return true;
    } catch (error) {
      this.logger.error(`MinIO health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async bucketExists(client: any, bucketName: string): Promise<boolean> {
    try {
      return await client.bucketExists(bucketName);
    } catch (error) {
      this.logger.error(`Failed to check bucket existence: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async createBucket(client: any, bucketName: string): Promise<void> {
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

  async enableVersioning(client: any, bucketName: string): Promise<void> {
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
    client: any,
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
    client: any,
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
    client: any,
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
      const objectPath = versionId
        ? `${bucketName}/${objectName} (${versionId})`
        : `${bucketName}/${objectName}`;
      this.logger.debug(`Removed object: ${objectPath}`);
    } catch (error) {
      this.logger.error(`Failed to remove object: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async removeAllVersions(
    client: any,
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
    client: any,
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
    client: any,
    bucketName: string,
    objectName: string,
  ): Promise<MinioObjectStat | null> {
    try {
      return await client.statObject(bucketName, objectName);
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null
          ? Reflect.get(error, 'code')
          : undefined;
      if (code === 'NotFound') {
        return null;
      }
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else {
        message = JSON.stringify(error);
      }
      this.logger.error(`Failed to stat object: ${message}`);
      throw error;
    }
  }

  async listObjects(
    client: any,
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
    client: any,
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

  async listObjectsStream(
    client: any,
    bucketName: string,
    prefix?: string,
  ): Promise<AsyncIterable<any>> {
    try {
      return client.listObjects(bucketName, prefix, true);
    } catch (error) {
      this.logger.error(`Failed to get objects stream: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
