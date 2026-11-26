import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { getBucketRoutedDriver } from './bucket-routing';

/** Bucket names a space may never take: the system bucket + AWS_S3_RESERVED_BUCKETS. */
export function reservedBuckets(): string[] {
  return [process.env.AWS_S3_BUCKET, ...(process.env.AWS_S3_RESERVED_BUCKETS ?? '').split(',')]
    .map((b) => b?.trim())
    .filter(Boolean) as string[];
}

/** The space's bucket name, assigned from its slug on first call (space_bucket_name()). */
export async function resolveSpaceBucketName(
  db: KyselyDB | KyselyTransaction,
  spaceId: string,
): Promise<string> {
  const { rows } = await sql<{ bucket: string }>`
    select space_bucket_name(${spaceId}::uuid, ${reservedBuckets()}::text[]) as bucket
  `.execute(db);
  return rows[0].bucket;
}

/**
 * Called right after a space row is inserted: creates its bucket in the
 * object store now. Pass the same transaction the space was inserted in, so
 * the name comes from its slug even before commit. Throws if the bucket
 * can't be created, which aborts the space creation. No-op unless
 * AWS_S3_BUCKET_PER_SPACE=true.
 */
export async function createBucketForNewSpace(
  db: KyselyDB | KyselyTransaction,
  spaceId: string,
): Promise<void> {
  const driver = getBucketRoutedDriver();
  if (!driver) return;
  const bucket = await resolveSpaceBucketName(db, spaceId);
  await driver.ensureSpaceBucket(spaceId, bucket);
}
