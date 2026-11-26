import {
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { InjectKysely } from 'nestjs-kysely';
import { resolveSpaceBucketName } from './space-bucket-name';
import { getBucketRoutedDriver, setSpaceBucketResolver } from './bucket-routing';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { relocatePageAttachments } from '../attachment-path/relocate-page-attachments';

const BATCH = 100;

/**
 * One-off migration to bucket-per-space: with AWS_S3_RELOCATE_ON_BOOT=true,
 * moves every page file still on a legacy key ({ws}/files/...) to its page
 * folder {ws}/{space}/..., i.e. into the space's bucket. Idempotent, runs in
 * the background; set the flag on ONE app instance only, then unset it.
 */
@Injectable()
export class RelocateAllOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(RelocateAllOnBoot.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storage: StorageService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.AWS_S3_RELOCATE_ON_BOOT !== 'true') return;
    void this.run();
  }

  async run(): Promise<void> {
    const rows = await this.db
      .selectFrom('attachments')
      .select('pageId')
      .distinct()
      .where('pageId', 'is not', null)
      .execute();
    const pageIds = rows.map((r) => r.pageId!);
    this.logger.log(`Relocating attachments of ${pageIds.length} pages`);

    for (let i = 0; i < pageIds.length; i += BATCH) {
      await relocatePageAttachments(this.db, this.storage, pageIds.slice(i, i + BATCH));
      this.logger.log(`Relocated ${Math.min(i + BATCH, pageIds.length)}/${pageIds.length} pages`);
    }
    this.logger.log('Relocation finished; unset AWS_S3_RELOCATE_ON_BOOT');
  }
}

/**
 * One-off: with AWS_S3_STRIP_PREFIX_ON_BOOT=true, renames objects still stored
 * as {workspaceId}/{spaceId}/... inside a space bucket to the prefix-less key
 * (see objectKey()). Only keys whose 2nd segment is that bucket's own space id
 * are touched, so already-migrated keys ({rootPage}/{childPage}/...) are safe.
 * Idempotent; set the flag on ONE app instance only, then unset it.
 */
@Injectable()
export class StripSpacePrefixOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(StripSpacePrefixOnBoot.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  onApplicationBootstrap() {
    if (process.env.AWS_S3_STRIP_PREFIX_ON_BOOT !== 'true') return;
    if (getBucketRoutedDriver()) void this.run();
  }

  async run(): Promise<void> {
    const client = getBucketRoutedDriver()!.getDriver();
    const spaces = await this.db.selectFrom('spaces').select('id').execute();
    let moved = 0;
    for (const { id } of spaces) {
      try {
        const bucket = await resolveSpaceBucketName(this.db, id);
        let token: string | undefined;
        do {
          const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
          );
          for (const { Key } of page.Contents ?? []) {
            const parts = Key!.split('/');
            if (parts.length < 3 || parts[1].toLowerCase() !== id.toLowerCase()) continue;
            const target = parts.slice(2).join('/');
            await client.send(
              new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `${bucket}/${parts.map(encodeURIComponent).join('/')}`,
                Key: target,
              }),
            );
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: Key! }));
            moved++;
          }
          token = page.NextContinuationToken;
        } while (token);
      } catch (err) {
        this.logger.error(`Strip prefix failed for space ${id}: ${err}`);
      }
    }
    this.logger.log(`Prefix stripped from ${moved} objects; unset AWS_S3_STRIP_PREFIX_ON_BOOT`);
  }
}

/** Gives the storage driver its spaceId -> bucket lookup (space_bucket_name()). */
@Injectable()
export class SpaceBucketResolverRegistrar implements OnModuleInit {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  onModuleInit() {
    setSpaceBucketResolver((spaceId) => resolveSpaceBucketName(this.db, spaceId));
  }
}

/**
 * On every boot with bucket-per-space on: every space already in the DB gets
 * its bucket in Silo if missing (new spaces get theirs when created).
 */
@Injectable()
export class EnsureSpaceBucketsOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnsureSpaceBucketsOnBoot.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  onApplicationBootstrap() {
    if (getBucketRoutedDriver()) void this.run();
  }

  async run(): Promise<void> {
    const driver = getBucketRoutedDriver()!;
    const spaces = await this.db.selectFrom('spaces').select(['id', 'slug']).execute();
    let failed = 0;
    for (const space of spaces) {
      try {
        await driver.ensureSpaceBucket(space.id);
      } catch (err) {
        failed++;
        this.logger.error(`No bucket for space ${space.slug} (${space.id}): ${err}`);
      }
    }
    this.logger.log(`Space buckets checked: ${spaces.length}, failed: ${failed}`);
  }
}

@Module({
  providers: [
    SpaceBucketResolverRegistrar,
    EnsureSpaceBucketsOnBoot,
    RelocateAllOnBoot,
    StripSpacePrefixOnBoot,
  ],
})
export class StorageBucketsModule {}
