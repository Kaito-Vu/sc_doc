import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Note: The core 'attachments' table already exists from migration 20240324T086700-attachments.ts
  // This migration only adds MinIO-specific features

  // Add MinIO-specific columns to existing attachments table
  try {
    await db.schema
      .alterTable('attachments')
      .addColumn('minio_bucket', 'varchar(255)')
      .execute();
  } catch {
    // Column might already exist, continue
  }

  try {
    await db.schema
      .alterTable('attachments')
      .addColumn('minio_path', 'varchar(1024)')
      .execute();
  } catch {
    // Column might already exist, continue
  }

  try {
    await db.schema
      .alterTable('attachments')
      .addColumn('minio_version_id', 'varchar(255)')
      .execute();
  } catch {
    // Column might already exist, continue
  }

  try {
    await db.schema
      .alterTable('attachments')
      .addColumn('storage_backend', 'varchar(50)', (col) =>
        col.defaultTo('local'),
      )
      .execute();
  } catch {
    // Column might already exist, continue
  }

  // Workspace MinIO settings table
  await db.schema
    .createTable('workspace_minio_settings')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col
        .notNull()
        .unique()
        .references('workspaces.id')
        .onDelete('cascade'),
    )
    .addColumn('minio_endpoint', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_access_key', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_secret_key', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_use_ssl', 'boolean', (col) => col.defaultTo(false))
    .addColumn('minio_bucket_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('bucket_created_at', 'timestamptz')
    .addColumn('gc_soft_delete_grace_days', 'integer', (col) =>
      col.defaultTo(30),
    )
    .addColumn('gc_version_retention_days', 'integer', (col) =>
      col.defaultTo(90),
    )
    .addColumn('gc_last_run_at', 'timestamptz')
    .addColumn('is_enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_configured', 'boolean', (col) => col.defaultTo(false))
    .addColumn('health_check_at', 'timestamptz')
    .addColumn('health_status', 'varchar(50)')
    .addColumn('health_message', 'text')
    .addColumn('minio_host_new', 'varchar(255)')
    .addColumn('migration_status', 'varchar(50)', (col) =>
      col.defaultTo('idle'),
    )
    .addColumn('migration_progress', 'integer', (col) =>
      col.defaultTo(0),
    )
    .addColumn('migration_total_files', 'integer')
    .addColumn('migration_processed_files', 'integer')
    .addColumn('migration_started_at', 'timestamptz')
    .addColumn('migration_eta', 'timestamptz')
    .addColumn('migration_error', 'text')
    .addColumn('last_successful_host', 'varchar(255)')
    .addColumn('encrypted_secret_key', 'text')
    .addColumn('host_change_requested_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_workspace_minio_settings_enabled')
    .ifNotExists()
    .on('workspace_minio_settings')
    .columns(['workspace_id'])
    .execute();

  // Attachment orphan markers table (for MinIO GC tracking)
  await db.schema
    .createTable('attachment_orphan_markers')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col
        .notNull()
        .references('workspaces.id')
        .onDelete('cascade'),
    )
    .addColumn('minio_path', 'varchar(1024)', (col) => col.notNull())
    .addColumn('minio_bucket', 'varchar(255)', (col) => col.notNull())
    .addColumn('reason', 'varchar(255)', (col) => col.notNull())
    .addColumn('marked_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('hard_delete_after', 'timestamptz', (col) => col.notNull())
    .addColumn('deletion_attempted_at', 'timestamptz')
    .addColumn('deletion_error', 'text')
    .addUniqueConstraint('attachments_orphan_unique', [
      'minio_bucket',
      'minio_path',
    ])
    .execute();

  await db.schema
    .createIndex('idx_orphan_markers_hard_delete_after')
    .ifNotExists()
    .on('attachment_orphan_markers')
    .column('hard_delete_after')
    .execute();

  await db.schema
    .createIndex('idx_orphan_markers_workspace_id')
    .ifNotExists()
    .on('attachment_orphan_markers')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable('attachment_orphan_markers')
    .ifExists()
    .execute();
  await db.schema
    .dropTable('workspace_minio_settings')
    .ifExists()
    .execute();

  // Drop MinIO columns from attachments table if they exist
  try {
    await db.schema
      .alterTable('attachments')
      .dropColumn('minio_bucket')
      .dropColumn('minio_path')
      .dropColumn('minio_version_id')
      .dropColumn('storage_backend')
      .execute();
  } catch {
    // Columns might not exist, continue
  }
}
