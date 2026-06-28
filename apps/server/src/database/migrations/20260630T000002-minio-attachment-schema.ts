import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Attachment metadata table
  await db.schema
    .createTable('attachments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('page_id', 'uuid', (col) => col.notNull().references('pages.id').onDelete('cascade'))
    .addColumn('subpage_id', 'uuid', (col) => col.references('pages.id').onDelete('set null'))
    .addColumn('filename', 'varchar(255)', (col) => col.notNull())
    .addColumn('file_extension', 'varchar(20)', (col) => col.notNull())
    .addColumn('mime_type', 'varchar(100)', (col) => col.notNull())
    .addColumn('file_size', 'bigint', (col) => col.notNull())
    .addColumn('minio_bucket', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_path', 'varchar(1024)', (col) => col.notNull())
    .addColumn('minio_version_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_etag', 'varchar(255)')
    .addColumn('minio_last_modified', 'timestamp')
    .addColumn('page_slug', 'varchar(255)', (col) => col.notNull())
    .addColumn('subpage_slug', 'varchar(255)')
    .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn('updated_by', 'uuid')
    .addColumn('updated_at', 'timestamp')
    .addColumn('deleted_by', 'uuid')
    .addColumn('soft_delete_at', 'timestamp')
    .addColumn('hard_deleted_at', 'timestamp')
    .addColumn('needs_resync', 'boolean', (col) => col.defaultTo(false))
    .addColumn('last_sync_at', 'timestamp')
    .addColumn('error_message', 'text')
    .addColumn('retry_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false))
    .addColumn('download_count', 'integer', (col) => col.defaultTo(0))
    .execute();

  // Create indexes for attachments
  await db.schema.createIndex('idx_attachments_workspace_id').on('attachments').column('workspace_id').execute();
  await db.schema.createIndex('idx_attachments_page_id').on('attachments').column('page_id').execute();
  await db.schema.createIndex('idx_attachments_created_by').on('attachments').column('created_by').execute();
  await db.schema.createIndex('idx_attachments_created_at').on('attachments').column('created_at').execute();

  // Partial indexes commented out - database will create basic indexes
  // These can be added later with raw SQL if needed for optimization
  // .where(sql`soft_delete_at is null and hard_deleted_at is null`)

  await db.schema.createIndex('idx_attachments_last_sync').on('attachments').columns(['last_sync_at', 'workspace_id']).execute();

  // Attachment version history table
  await db.schema
    .createTable('attachment_version_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('attachment_id', 'uuid', (col) => col.notNull().references('attachments.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('action', 'varchar(50)', (col) => col.notNull())
    .addColumn('actor_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('old_values', 'jsonb')
    .addColumn('new_values', 'jsonb')
    .addColumn('minio_version_id', 'varchar(255)')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .execute();

  await db.schema.createIndex('idx_attachment_version_history_attachment_id').on('attachment_version_history').column('attachment_id').execute();
  await db.schema.createIndex('idx_attachment_version_history_actor_id').on('attachment_version_history').column('actor_id').execute();
  await db.schema
    .createIndex('idx_attachment_version_history_created_at')
    .on('attachment_version_history')
    .column('created_at')
    .execute();

  // Attachment locks table
  await db.schema
    .createTable('attachment_locks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('attachment_id', 'uuid', (col) => col.notNull().unique().references('attachments.id').onDelete('cascade'))
    .addColumn('locked_by', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('locked_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn('expires_at', 'timestamp', (col) => col.notNull())
    .execute();

  await db.schema.createIndex('idx_attachment_locks_expires_at').on('attachment_locks').column('expires_at').execute();

  // Attachment orphan markers table
  await db.schema
    .createTable('attachment_orphan_markers')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('minio_path', 'varchar(1024)', (col) => col.notNull())
    .addColumn('minio_bucket', 'varchar(255)', (col) => col.notNull())
    .addColumn('reason', 'varchar(255)', (col) => col.notNull())
    .addColumn('marked_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn('hard_delete_after', 'timestamp', (col) => col.notNull())
    .addColumn('deletion_attempted_at', 'timestamp')
    .addColumn('deletion_error', 'text')
    .addUniqueConstraint('attachments_orphan_unique', ['minio_bucket', 'minio_path'])
    .execute();

  await db.schema.createIndex('idx_orphan_markers_hard_delete_after').on('attachment_orphan_markers').column('hard_delete_after').execute();
  await db.schema.createIndex('idx_orphan_markers_workspace_id').on('attachment_orphan_markers').column('workspace_id').execute();

  // Workspace MinIO settings table
  await db.schema
    .createTable('workspace_minio_settings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().unique().references('workspaces.id').onDelete('cascade'))
    .addColumn('minio_endpoint', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_access_key', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_secret_key', 'varchar(255)', (col) => col.notNull())
    .addColumn('minio_use_ssl', 'boolean', (col) => col.defaultTo(false))
    .addColumn('minio_bucket_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('bucket_created_at', 'timestamp')
    .addColumn('gc_soft_delete_grace_days', 'integer', (col) => col.defaultTo(30))
    .addColumn('gc_version_retention_days', 'integer', (col) => col.defaultTo(90))
    .addColumn('gc_last_run_at', 'timestamp')
    .addColumn('is_enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_configured', 'boolean', (col) => col.defaultTo(false))
    .addColumn('health_check_at', 'timestamp')
    .addColumn('health_status', 'varchar(50)')
    .addColumn('health_message', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .execute();

  // Note: Partial index on is_enabled commented out
  // Basic index on workspace_id created instead
  await db.schema
    .createIndex('idx_workspace_minio_settings_enabled')
    .on('workspace_minio_settings')
    .columns(['workspace_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('workspace_minio_settings').ifExists().execute();
  await db.schema.dropTable('attachment_orphan_markers').ifExists().execute();
  await db.schema.dropTable('attachment_locks').ifExists().execute();
  await db.schema.dropTable('attachment_version_history').ifExists().execute();
  await db.schema.dropTable('attachments').ifExists().execute();
}
