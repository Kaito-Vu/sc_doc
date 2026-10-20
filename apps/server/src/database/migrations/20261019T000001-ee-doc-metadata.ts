import { Kysely, sql } from 'kysely';

// EE document-management metadata (owner, classification, review dates).
// Kept in its own table keyed by page id so core `pages` stays untouched.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ee_doc_metadata')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().unique().references('pages.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('owner_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('reviewer_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('classification', 'varchar')
    .addColumn('doc_type', 'varchar')
    .addColumn('effective_at', 'timestamptz')
    .addColumn('review_due_at', 'timestamptz')
    .addColumn('archived_at', 'timestamptz')
    .addColumn('notes', 'text')
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_ee_doc_metadata_workspace_space')
    .ifNotExists()
    .on('ee_doc_metadata')
    .columns(['workspace_id', 'space_id'])
    .execute();

  await db.schema
    .createIndex('idx_ee_doc_metadata_review_due')
    .ifNotExists()
    .on('ee_doc_metadata')
    .column('review_due_at')
    .execute();

  await db.schema
    .createIndex('idx_ee_doc_metadata_owner')
    .ifNotExists()
    .on('ee_doc_metadata')
    .column('owner_id')
    .execute();

  // Backfill one metadata row per existing page so the document library is
  // complete from day one. New pages are still created lazily on first open.
  await sql`
    INSERT INTO ee_doc_metadata (
      page_id,
      workspace_id,
      space_id,
      owner_id,
      created_by_id,
      updated_by_id
    )
    SELECT
      p.id,
      p.workspace_id,
      p.space_id,
      p.creator_id,
      p.creator_id,
      p.creator_id
    FROM pages p
    WHERE p.deleted_at IS NULL
    ON CONFLICT (page_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ee_doc_metadata').ifExists().execute();
}
