import { Kysely, sql } from 'kysely';

// Perf indexes for EE read paths (audit list, verification search/listing,
// contributor stats). f_unaccent is IMMUTABLE and pg_trgm is already installed
// by 20250729T213756. Plain CREATE INDEX: kysely migrations run in a
// transaction, so CONCURRENTLY is not available here.
export async function up(db: Kysely<any>): Promise<void> {
  // audit list orders by id desc (uuid v7 => time order)
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_workspace_id_desc ON audit (workspace_id, id DESC)`.execute(
    db,
  );

  // ponytail: no f_unaccent trigram index — index builds run with a locked
  // search_path, so the unqualified unaccent() inside f_unaccent fails to resolve.
  // Add later only after schema-qualifying f_unaccent.

  // verification list order + latest-per-page lookup
  await sql`CREATE INDEX IF NOT EXISTS idx_page_verifications_ws_created ON page_verifications (workspace_id, created_at DESC, id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_page_verifications_page_created ON page_verifications (page_id, created_at DESC)`.execute(
    db,
  );

  // contributor stats: filter page_history by workspace + time
  await sql`CREATE INDEX IF NOT EXISTS idx_page_history_ws_created ON page_history (workspace_id, created_at) INCLUDE (last_updated_by_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const name of [
    'idx_audit_workspace_id_desc',
    'idx_page_verifications_ws_created',
    'idx_page_verifications_page_created',
    'idx_page_history_ws_created',
  ]) {
    await sql`DROP INDEX IF EXISTS ${sql.id(name)}`.execute(db);
  }
}
