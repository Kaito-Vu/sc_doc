import { Logger } from '@nestjs/common';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { S3Driver } from '../../integrations/storage/drivers/s3.driver';
import {
  S3StorageConfig,
  StorageDriver,
  StorageOption,
} from '../../integrations/storage/interfaces';

const logger = new Logger('BucketRouting');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// page files live at {workspaceId}/{spaceId}/... (see attachment-path)
const SPACE_KEY = new RegExp(`^${UUID}/(${UUID})/`, 'i');

/** Space an object key belongs to, or null for system files. */
export function spaceIdOfKey(key: string): string | null {
  return key.match(SPACE_KEY)?.[1]?.toLowerCase() ?? null;
}

export function isBucketPerSpaceEnabled(): boolean {
  return process.env.AWS_S3_BUCKET_PER_SPACE === 'true';
}

/** spaceId -> bucket name (from the space slug, fixed once assigned). */
export type SpaceBucketResolver = (spaceId: string) => Promise<string>;

// ponytail: module-level hook because the driver is built outside Nest DI;
// StorageBucketsModule registers the DB-backed resolver at startup.
let spaceBucketResolver: SpaceBucketResolver | null = null;
export function setSpaceBucketResolver(resolver: SpaceBucketResolver): void {
  spaceBucketResolver = resolver;
}

// the routed driver in use (null when bucket-per-space is off)
let activeDriver: BucketRoutedS3Driver | null = null;
export function getBucketRoutedDriver(): BucketRoutedS3Driver | null {
  return activeDriver;
}

/**
 * S3 driver that stores each space's files in its own bucket, named after
 * the space slug (see space_bucket_name() in the space-buckets migration),
 * and everything else (avatars, logos, exports, template/legacy files) in
 * the configured AWS_S3_BUCKET ("system"). Keys never change; buckets are
 * created on first write.
 */
export class BucketRoutedS3Driver implements StorageDriver {
  private readonly drivers = new Map<string, S3Driver>();
  private readonly ensured = new Map<string, Promise<void>>();
  private readonly spaceBuckets = new Map<string, string>();
  private readonly base: S3Driver;

  constructor(private readonly config: S3StorageConfig) {
    this.base = new S3Driver(config);
    this.drivers.set(config.bucket, this.base);
    activeDriver = this;
  }

  private async bucket(key: string): Promise<string> {
    const spaceId = spaceIdOfKey(key);
    return spaceId ? this.spaceBucket(spaceId) : this.config.bucket;
  }

  /**
   * Creates the space's bucket now if it does not exist yet. `knownBucket`
   * skips the lookup (used at space creation, where the name was resolved
   * inside the creating transaction).
   */
  async ensureSpaceBucket(spaceId: string, knownBucket?: string): Promise<string> {
    const id = spaceId.toLowerCase();
    if (knownBucket) this.spaceBuckets.set(id, knownBucket);
    const bucket = await this.spaceBucket(id);
    await this.ensureBucket(bucket);
    return bucket;
  }

  private async spaceBucket(spaceId: string): Promise<string> {
    const cached = this.spaceBuckets.get(spaceId);
    if (cached) return cached;
    if (!spaceBucketResolver) {
      throw new Error('Space bucket resolver not registered yet');
    }
    const bucket = await spaceBucketResolver(spaceId);
    this.spaceBuckets.set(spaceId, bucket); // never changes once assigned
    return bucket;
  }

  private driver(bucket: string): S3Driver {
    let driver = this.drivers.get(bucket);
    if (!driver) {
      driver = new S3Driver({ ...this.config, bucket });
      // ponytail: share one client (and its socket pool) across buckets;
      // S3Driver keeps it private, so it is swapped in after construction.
      (driver as any).s3Client.destroy();
      (driver as any).s3Client = this.base.getDriver();
      this.drivers.set(bucket, driver);
    }
    return driver;
  }

  private async reader(key: string): Promise<S3Driver> {
    return this.driver(await this.bucket(key));
  }

  private async writer(key: string): Promise<S3Driver> {
    const bucket = await this.bucket(key);
    await this.ensureBucket(bucket);
    return this.driver(bucket);
  }

  private ensureBucket(bucket: string): Promise<void> {
    let ensured = this.ensured.get(bucket);
    if (!ensured) {
      ensured = this.createIfMissing(bucket).catch((err) => {
        this.ensured.delete(bucket); // retry on next write
        throw err;
      });
      this.ensured.set(bucket, ensured);
    }
    return ensured;
  }

  private async createIfMissing(bucket: string): Promise<void> {
    const client = this.getDriver();
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode !== 404) throw err;
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      logger.log(`Created bucket ${bucket}`);
    } catch (err: any) {
      const name = err?.name ?? err?.Code;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
        throw err;
      }
    }
  }

  async upload(filePath: string, file: Buffer | Readable): Promise<void> {
    return (await this.writer(filePath)).upload(filePath, file);
  }

  async uploadStream(
    filePath: string,
    file: Readable,
    options?: { recreateClient?: boolean },
  ): Promise<void> {
    return (await this.writer(filePath)).uploadStream(filePath, file, options);
  }

  async copy(fromFilePath: string, toFilePath: string): Promise<void> {
    const from = await this.bucket(fromFilePath);
    const to = await this.bucket(toFilePath);
    if (from === to) {
      return (await this.writer(toFilePath)).copy(fromFilePath, toFilePath);
    }
    // cross-bucket (e.g. page moved to another space); same semantics as S3Driver.copy
    try {
      if (!(await this.exists(fromFilePath))) return;
      await this.ensureBucket(to);
      const encodedPath = fromFilePath.split('/').map(encodeURIComponent).join('/');
      await this.getDriver().send(
        new CopyObjectCommand({
          Bucket: to,
          CopySource: `${from}/${encodedPath}`,
          Key: toFilePath,
        }),
      );
    } catch (err) {
      throw new Error(`Failed to copy file: ${(err as Error).message}`);
    }
  }

  async read(filePath: string): Promise<Buffer> {
    return (await this.reader(filePath)).read(filePath);
  }

  async readStream(filePath: string): Promise<Readable> {
    return (await this.reader(filePath)).readStream(filePath);
  }

  async readRangeStream(
    filePath: string,
    range: { start: number; end: number },
  ): Promise<Readable> {
    return (await this.reader(filePath)).readRangeStream(filePath, range);
  }

  async exists(filePath: string): Promise<boolean> {
    return (await this.reader(filePath)).exists(filePath);
  }

  /** Sync API: only works for system files or spaces already resolved. */
  getUrl(filePath: string): string {
    const spaceId = spaceIdOfKey(filePath);
    const bucket = spaceId ? this.spaceBuckets.get(spaceId) : this.config.bucket;
    if (!bucket) throw new Error(`Bucket of ${filePath} not resolved yet`);
    return this.driver(bucket).getUrl(filePath);
  }

  async getSignedUrl(filePath: string, expireIn: number): Promise<string> {
    return (await this.reader(filePath)).getSignedUrl(filePath, expireIn);
  }

  async delete(filePath: string): Promise<void> {
    return (await this.reader(filePath)).delete(filePath);
  }

  getDriver(): S3Client {
    return this.base.getDriver();
  }

  getDriverName(): string {
    return StorageOption.S3;
  }

  getConfig(): Record<string, any> {
    return this.base.getConfig();
  }
}

/** S3 driver factory: bucket-per-space when AWS_S3_BUCKET_PER_SPACE=true. */
export function createS3Driver(config: S3StorageConfig): StorageDriver {
  return isBucketPerSpaceEnabled()
    ? new BucketRoutedS3Driver(config)
    : new S3Driver(config);
}
