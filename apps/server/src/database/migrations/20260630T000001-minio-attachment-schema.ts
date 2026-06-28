import { Kysely, sql } from 'kysely';

/**
 * Migration: MinIO Attachment Storage Schema
 *
 * This migration adds comprehensive support for MinIO-backed attachment storage,
 * including version history tracking, soft-delete workflow, orphan detection, and
 * distributed locking for concurrent operations.
 *
 * Design principles:
 * - Minimize metadata in PostgreSQL (store only what's needed for queries and GC)
 * - Support eventual consistency with MinIO (via async reconciliation)
 * - Enable safe soft-delete with configurable hard-delete grace period
 * - Efficient garbage collection with orphan marker tracking
 * - Concurrent upload safety via distributed locks
 */

export async function up(db: Kysely<any>): Promise<void> {
  /**
   * Table: attachment_version_history
   *
   * Tracks all actions on attachments (uploads, deletes, restores, metadata updates)
   * for compliance audits and user-facing change logs.
   */
  await db.schema
    .createTable('attachment_version_history')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('attachment_id', 'uuid', (col) =>
      col.references('attachments.id').onDelete('cascade').notNull(),
    )
    .addColumn('minio_version_id', 'varchar')
    .addColumn('version_number', 'int4', (col) => col.notNull())
    .addColumn('action', 'varchar', (col) => col.notNull())
    .addColumn('actor_id', 'uuid', (col) =>
      col.references('users.id').notNull(),
    )
    .addColumn('file_size', 'int8')
    .addColumn('mime_type', 'varchar')
    .addColumn('minio_etag', 'varchar')
    .addColumn('change_reason', 'text')
    .addColumn('ip_address', 'inet')
    .addColumn('user_agent', 'varchar')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  /**
   * Table: attachment_locks
   *
   * Distributed locking for concurrent operations (uploads, renames, moves).
   * Prevents race conditions and ensures atomic path updates.
   */
  await db.schema
    .createTable('attachment_locks')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('locked_resource_type', 'varchar', (col) => col.notNull())
    .addColumn('locked_resource_id', 'uuid', (col) => col.notNull())
    .addColumn('holder_session_id', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('attachment_locks_resource_session_unique', [
      'locked_resource_type',
      'locked_resource_id',
      'holder_session_id',
    ])
    .execute();

  /**
   * Table: attachment_orphan_markers
   *
   * Tracks MinIO objects that no longer have corresponding DB records.
   * Provides grace period before hard deletion to prevent accidental data loss.
   */
  await db.schema
    .createTable('attachment_orphan_markers')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('minio_path', 'varchar', (col) => col.notNull())
    .addColumn('minio_version_id', 'varchar')
    .addColumn('discovered_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('scheduled_for_deletion', 'timestamptz')
    .addColumn('deletion_attempt_count', 'int4', (col) => col.defaultTo(0))
    .addColumn('last_deletion_error', 'text')
    .addColumn('deleted_at', 'timestamptz')
    .addUniqueConstraint('orphan_markers_workspace_path_unique', [
      'workspace_id',
      'minio_path',
    ])
    .execute();

  /**
   * Enhance attachments table with MinIO metadata and lifecycle management
   */
  await db.schema
    .alterTable('attachments')
    .addColumn('minio_path', 'varchar')
    .addColumn('minio_version_id', 'varchar')
    .addColumn('minio_etag', 'varchar')
    .addColumn('minio_last_modified', 'timestamptz')
    .addColumn('status', 'varchar', (col) => col.defaultTo('active'))
    .addColumn('soft_deleted_at', 'timestamptz')
    .addColumn('soft_deleted_by_id', 'uuid', (col) =>
      col.references('users.id'),
    )
    .addColumn('hard_deleted_at', 'timestamptz')
    .addColumn('uploaded_at', 'timestamptz')
    .addColumn('last_synced_at', 'timestamptz')
    .addColumn('needs_resync', 'boolean', (col) => col.defaultTo(false))
    .addUniqueConstraint('attachments_minio_path_unique', ['minio_path'])
    .execute();

  /**
   * Add constraints to enforce status state machine
   */
  await sql`
    ALTER TABLE attachments
    ADD CONSTRAINT attachments_valid_status
      CHECK (status IN ('active', 'soft_deleted', 'hard_deleted')),
    ADD CONSTRAINT attachments_soft_delete_coherent
      CHECK (
        (status != 'soft_deleted' AND soft_deleted_at IS NULL) OR
        (status = 'soft_deleted' AND soft_deleted_at IS NOT NULL)
      ),
    ADD CONSTRAINT attachments_hard_delete_coherent
      CHECK (
        (status != 'hard_deleted' AND hard_deleted_at IS NULL) OR
        (status = 'hard_deleted' AND hard_deleted_at IS NOT NULL)
      ),
    ADD CONSTRAINT attachments_upload_complete_or_null
      CHECK (
        (file_size IS NOT NULL AND uploaded_at IS NOT NULL) OR
        (file_size IS NULL AND uploaded_at IS NULL)
      )
  `.execute(db);

  /**
   * Backfill soft_deleted_at from deleted_at for existing soft-deleted records
   */
  await sql`
    UPDATE attachments
    SET soft_deleted_at = deleted_at, status = 'soft_deleted'
    WHERE deleted_at IS NOT NULL AND soft_deleted_at IS NULL
  `.execute(db);

  /**
   * Backfill uploaded_at for existing records (assume they completed)
   */
  await sql`
    UPDATE attachments
    SET uploaded_at = created_at
    WHERE uploaded_at IS NULL AND status != 'soft_deleted'
  `.execute(db);

  /**
   * Backfill minio_path for existing attachments
   * Format: {workspace_id}/{space_id}/{page_id}/{parent_page_id or 'null'}/{filename}
   */
  await sql`
    UPDATE attachments a
    SET minio_path = CONCAT(
      a.workspace_id::text, '/',
      a.space_id::text, '/',
      a.page_id::text, '/',
      COALESCE(p.parent_page_id::text, 'null'), '/',
      a.file_name
    )
    FROM pages p
    WHERE a.page_id = p.id AND a.minio_path IS NULL
  `.execute(db);

  /**
   * Add parent_page_id to attachments for efficient hierarchy queries
   */
  await db.schema
    .alterTable('attachments')
    .addColumn('parent_page_id', 'uuid')
    .execute();

  /**
   * Backfill parent_page_id from pages table
   */
  await sql`
    UPDATE attachments a
    SET parent_page_id = p.parent_page_id
    FROM pages p
    WHERE a.page_id = p.id
  `.execute(db);

  /**
   * Create indexes for common query patterns
   */

  // Active attachments by page
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_page_active
    ON attachments(page_id, created_at DESC)
    WHERE status = 'active'
  `.execute(db);

  // Active attachments by space (for space storage view)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_space_active
    ON attachments(space_id, created_at DESC)
    WHERE status = 'active'
  `.execute(db);

  // Active attachments by workspace (for workspace storage reports)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_workspace_active
    ON attachments(workspace_id, created_at DESC)
    WHERE status = 'active'
  `.execute(db);

  // Attachments by creator
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_creator_workspace
    ON attachments(creator_id, workspace_id, created_at DESC)
    WHERE status = 'active'
  `.execute(db);

  // Soft-deleted attachments (trash bin view)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_soft_deleted
    ON attachments(workspace_id, soft_deleted_at DESC)
    WHERE status = 'soft_deleted'
  `.execute(db);

  // Soft-deleted older than grace period (for GC)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_soft_deleted_older_than
    ON attachments(workspace_id, soft_deleted_at)
    WHERE status = 'soft_deleted' AND soft_deleted_at < now() - INTERVAL '30 days'
  `.execute(db);

  // Items needing resync (for async reconciliation)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_needs_resync
    ON attachments(workspace_id, needs_resync)
    WHERE needs_resync = TRUE
  `.execute(db);

  // Incomplete uploads (for orphan detection)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_incomplete_upload
    ON attachments(workspace_id, created_at)
    WHERE uploaded_at IS NULL AND status = 'active'
  `.execute(db);

  // Version history indexes
  await db.schema
    .createIndex('idx_attachment_version_history_attachment')
    .on('attachment_version_history')
    .columns(['attachment_id', 'version_number'])
    .execute();

  await db.schema
    .createIndex('idx_attachment_version_history_actor')
    .on('attachment_version_history')
    .columns(['actor_id', 'created_at'])
    .execute();

  // Lock cleanup (expired locks)
  await db.schema
    .createIndex('idx_attachment_locks_expires')
    .on('attachment_locks')
    .column('expires_at')
    .execute();

  // Orphan markers ready for deletion
  await sql`
    CREATE INDEX IF NOT EXISTS idx_orphan_markers_ready_for_deletion
    ON attachment_orphan_markers(workspace_id, scheduled_for_deletion)
    WHERE deleted_at IS NULL
  `.execute(db);

  /**
   * Trigger: Cascade page deletion to attachments (soft-delete)
   *
   * When a page is deleted, mark all its attachments as soft-deleted.
   * This prevents orphaned attachments and gives users a grace period to restore.
   */
  await sql`
    CREATE OR REPLACE FUNCTION mark_attachments_soft_deleted()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE attachments
      SET status = 'soft_deleted',
          soft_deleted_at = now(),
          soft_deleted_by_id = NULL  -- System delete
      WHERE page_id = OLD.id AND status = 'active';
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS cascade_page_delete_to_attachments ON pages;
    CREATE TRIGGER cascade_page_delete_to_attachments
    AFTER DELETE ON pages
    FOR EACH ROW
    EXECUTE FUNCTION mark_attachments_soft_deleted();
  `.execute(db);

  /**
   * Update existing indexes from prior migration to keep attachment queries fast
   */
  await db.schema
    .createIndex('idx_attachments_workspace_id')
    .ifNotExists()
    .on('attachments')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_attachments_page_id')
    .ifNotExists()
    .on('attachments')
    .column('page_id')
    .execute();

  await db.schema
    .createIndex('idx_attachments_space_id')
    .ifNotExists()
    .on('attachments')
    .column('space_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  /**
   * Drop triggers
   */
  await sql`
    DROP TRIGGER IF EXISTS cascade_page_delete_to_attachments ON pages;
    DROP FUNCTION IF EXISTS mark_attachments_soft_deleted();
  `.execute(db);

  /**
   * Drop indexes
   */
  await db.schema
    .dropIndex('idx_attachments_page_active')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_space_active')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_workspace_active')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_creator_workspace')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_soft_deleted')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_soft_deleted_older_than')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_needs_resync')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachments_incomplete_upload')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachment_version_history_attachment')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachment_version_history_actor')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_attachment_locks_expires')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_orphan_markers_ready_for_deletion')
    .ifExists()
    .execute();

  /**
   * Drop constraints
   */
  await sql`
    ALTER TABLE attachments
    DROP CONSTRAINT IF EXISTS attachments_valid_status,
    DROP CONSTRAINT IF EXISTS attachments_soft_delete_coherent,
    DROP CONSTRAINT IF EXISTS attachments_hard_delete_coherent,
    DROP CONSTRAINT IF EXISTS attachments_upload_complete_or_null,
    DROP CONSTRAINT IF EXISTS attachments_minio_path_unique
  `.execute(db);

  /**
   * Drop columns from attachments
   */
  await db.schema
    .alterTable('attachments')
    .dropColumn('minio_path')
    .dropColumn('minio_version_id')
    .dropColumn('minio_etag')
    .dropColumn('minio_last_modified')
    .dropColumn('status')
    .dropColumn('soft_deleted_at')
    .dropColumn('soft_deleted_by_id')
    .dropColumn('hard_deleted_at')
    .dropColumn('uploaded_at')
    .dropColumn('last_synced_at')
    .dropColumn('needs_resync')
    .dropColumn('parent_page_id')
    .execute();

  /**
   * Drop new tables
   */
  await db.schema.dropTable('attachment_orphan_markers').ifExists().execute();
  await db.schema.dropTable('attachment_locks').ifExists().execute();
  await db.schema
    .dropTable('attachment_version_history')
    .ifExists()
    .execute();
}
