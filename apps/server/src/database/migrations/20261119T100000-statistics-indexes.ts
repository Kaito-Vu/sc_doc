import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_comments_ws_space_created
    ON comments (workspace_id, space_id, created_at)
    WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_page_history_space_created
    ON page_history (space_id, created_at)
    INCLUDE (page_id, last_updated_by_id)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_ws_created
    ON pages (workspace_id, created_at)
    INCLUDE (space_id, updated_at, creator_id)
    WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_page_verifications_ws_page_created
    ON page_verifications (workspace_id, page_id, created_at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_ws_space
    ON attachments (workspace_id, space_id)
    INCLUDE (file_size)
    WHERE deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const name of [
    'idx_comments_ws_space_created',
    'idx_page_history_space_created',
    'idx_pages_ws_created',
    'idx_page_verifications_ws_page_created',
    'idx_attachments_ws_space',
  ]) {
    await db.schema.dropIndex(name).ifExists().execute();
  }
}
