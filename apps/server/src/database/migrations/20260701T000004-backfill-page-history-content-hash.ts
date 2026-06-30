import { createHash } from 'node:crypto';
import { type Kysely } from 'kysely';

function computeContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content ?? null))
    .digest('hex')
    .slice(0, 8);
}

export async function up(db: Kysely<any>): Promise<void> {
  const batchSize = 200;

  while (true) {
    const rows = await db
      .selectFrom('page_history')
      .select(['id', 'content'])
      .where('content_hash', 'is', null)
      .orderBy('id', 'asc')
      .limit(batchSize)
      .execute();

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      await db
        .updateTable('page_history')
        .set({ content_hash: computeContentHash(row.content) })
        .where('id', '=', row.id)
        .execute();
    }
  }
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Irreversible: cannot distinguish backfilled hashes from native ones.
}
