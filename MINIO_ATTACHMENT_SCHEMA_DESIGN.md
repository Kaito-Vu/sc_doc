# MinIO Attachment Storage Schema Design for Docmost

## Executive Summary

This document provides a comprehensive database schema design for MinIO-backed attachment storage in Docmost. The design prioritizes:
- **Minimal metadata tracking** in PostgreSQL (store only what's needed for queries and GC)
- **Eventual consistency** with MinIO (via async reconciliation)
- **High-concurrency uploads** (lock-free, idempotent uploads)
- **Efficient garbage collection** (fast orphan detection)
- **Soft-delete with hard-cleanup** (dual-stage deletion for safety)

---

## 1. Database Schema Design

### Core Tables

#### 1.1 `attachments` (Enhanced)

**Purpose:** Single source of truth for attachment lifecycle management.

```sql
-- Main attachment metadata table
CREATE TABLE attachments (
    -- Identity & Storage
    id                          UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    minio_path                  VARCHAR NOT NULL UNIQUE,  -- Full path in MinIO
    filename                    VARCHAR NOT NULL,         -- Original filename
    file_ext                    VARCHAR NOT NULL,         -- Extension (.pdf, .jpg, etc.)
    
    -- Size & Type
    file_size                   INT8,                     -- bytes (can be NULL until upload completes)
    mime_type                   VARCHAR,                  -- application/pdf, image/jpeg, etc.
    
    -- Hierarchy & Access
    workspace_id                UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    space_id                    UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    page_id                     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    parent_page_id              UUID,                     -- For subpage attachments (denormalized for queries)
    
    -- Creator & Audit
    creator_id                  UUID NOT NULL REFERENCES users(id),
    
    -- MinIO Versioning (DO track these for reconciliation & GC)
    minio_version_id            VARCHAR,                  -- Latest version ID in MinIO
    minio_etag                  VARCHAR,                  -- Latest ETag for integrity checks
    minio_last_modified         TIMESTAMPTZ,              -- Latest modification time in MinIO
    
    -- Lifecycle & Soft-Delete
    status                      VARCHAR NOT NULL DEFAULT 'active',  
                                -- Values: 'active', 'soft_deleted', 'hard_deleted'
                                -- 'active': normal file
                                -- 'soft_deleted': marked for deletion (user deleted)
                                -- 'hard_deleted': GC removed from MinIO & DB
    
    soft_deleted_at             TIMESTAMPTZ,              -- When user requested deletion
    soft_deleted_by_id          UUID REFERENCES users(id),
    hard_deleted_at             TIMESTAMPTZ,              -- When GC removed it
    
    -- Search & Discovery
    text_content                TEXT,                     -- OCR'd text (images) or extracted (PDFs)
    tsv                         TSVECTOR,                 -- Full-text search vector
    
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_at                 TIMESTAMPTZ,              -- When upload fully completed to MinIO
    
    -- Sync State (for MinIO reconciliation)
    last_synced_at              TIMESTAMPTZ,              -- Last time we verified with MinIO
    needs_resync                BOOLEAN DEFAULT FALSE,    -- Flag for async reconciliation
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'soft_deleted', 'hard_deleted')),
    CONSTRAINT soft_delete_coherent CHECK (
        (status != 'soft_deleted' AND soft_deleted_at IS NULL) OR
        (status = 'soft_deleted' AND soft_deleted_at IS NOT NULL)
    ),
    CONSTRAINT hard_delete_coherent CHECK (
        (status != 'hard_deleted' AND hard_deleted_at IS NULL) OR
        (status = 'hard_deleted' AND hard_deleted_at IS NOT NULL)
    ),
    CONSTRAINT upload_complete_or_null CHECK (
        (file_size IS NOT NULL AND uploaded_at IS NOT NULL) OR
        (file_size IS NULL AND uploaded_at IS NULL)
    )
);
```

#### 1.2 `attachment_version_history` (NEW - Optional but Recommended)

**Purpose:** Track upload attempts, version changes, and user actions for audit trails.

```sql
-- Audit trail for attachment lifecycle events
CREATE TABLE attachment_version_history (
    id                          UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    attachment_id               UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    
    -- Version tracking
    minio_version_id            VARCHAR,                  -- Version ID in MinIO (if versioned)
    version_number              INT NOT NULL,             -- Local version counter: 1, 2, 3...
    
    -- Action & Actor
    action                      VARCHAR NOT NULL,         
                                -- 'uploaded', 'replaced', 'soft_deleted', 'restored', 'metadata_updated'
    actor_id                    UUID NOT NULL REFERENCES users(id),
    
    -- Metadata snapshot (for audit trail)
    file_size                   INT8,
    mime_type                   VARCHAR,
    minio_etag                  VARCHAR,
    
    -- Change metadata
    change_reason               TEXT,                     -- Why was this action taken?
    ip_address                  INET,                     -- Source IP (optional, for security audit)
    user_agent                  VARCHAR,                  -- Browser/client info (optional)
    
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 1.3 `attachment_locks` (NEW - For concurrent upload safety)

**Purpose:** Prevent concurrent uploads of the same file; coordinate rename/move operations.

```sql
-- Distributed locking for concurrent operations
CREATE TABLE attachment_locks (
    id                          UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    
    -- Lock scope
    locked_resource_type        VARCHAR NOT NULL,         
                                -- 'attachment', 'page_rename', 'page_move'
    locked_resource_id          UUID NOT NULL,
    
    -- Holder & Lifecycle
    holder_session_id           VARCHAR NOT NULL,         -- Session/request ID of lock holder
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at                  TIMESTAMPTZ NOT NULL,     -- Auto-release after timeout
    
    UNIQUE(locked_resource_type, locked_resource_id, holder_session_id),
    INDEX idx_attachment_locks_expires (expires_at)
);
```

#### 1.4 `attachment_orphan_markers` (NEW - For garbage collection)

**Purpose:** Mark objects in MinIO that no longer have DB records; stage for deletion.

```sql
-- Track orphaned MinIO objects awaiting hard deletion
CREATE TABLE attachment_orphan_markers (
    id                          UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    
    workspace_id                UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    minio_path                  VARCHAR NOT NULL,         -- Path that doesn't exist in DB
    minio_version_id            VARCHAR,                  -- Version to delete (if any)
    
    -- Reconciliation
    discovered_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_for_deletion      TIMESTAMPTZ,              -- GC grace period (default: now() + 7 days)
    deletion_attempt_count      INT DEFAULT 0,
    last_deletion_error         TEXT,                     -- Store error for debugging
    
    -- Cleanup
    deleted_at                  TIMESTAMPTZ,              -- Marked when hard-deleted from MinIO
    
    UNIQUE(workspace_id, minio_path),
    INDEX idx_orphan_markers_scheduled (scheduled_for_deletion)
);
```

---

## 2. Index Strategy

### Critical Indexes

```sql
-- Query by attachment ID (PK already indexed)
-- No index needed, it's the primary key

-- Query by page (list attachments on a page)
CREATE INDEX idx_attachments_page_active 
ON attachments(page_id, created_at DESC) 
WHERE status = 'active';

-- Query by space (list all attachments in a space)
CREATE INDEX idx_attachments_space_active 
ON attachments(space_id, created_at DESC) 
WHERE status = 'active';

-- Query by workspace (billing, storage reports)
CREATE INDEX idx_attachments_workspace_active 
ON attachments(workspace_id, created_at DESC) 
WHERE status = 'active';

-- Query by creator (user's uploads across workspace)
CREATE INDEX idx_attachments_creator_workspace 
ON attachments(creator_id, workspace_id, created_at DESC)
WHERE status = 'active';

-- Date range queries (GC, storage reports)
CREATE INDEX idx_attachments_created_range 
ON attachments(workspace_id, created_at DESC)
WHERE status = 'active';

-- Soft-deleted items (trash/recovery view)
CREATE INDEX idx_attachments_soft_deleted 
ON attachments(workspace_id, soft_deleted_at DESC)
WHERE status = 'soft_deleted';

-- Full-text search
CREATE INDEX idx_attachments_tsv 
ON attachments USING GIN(tsv);

-- Full-text + workspace filter
CREATE INDEX idx_attachments_workspace_tsv 
ON attachments(workspace_id) 
INCLUDE (tsv);  -- PostgreSQL 11+, store tsv in index

-- MinIO reconciliation (find items needing resync)
CREATE INDEX idx_attachments_needs_resync 
ON attachments(workspace_id, needs_resync)
WHERE needs_resync = TRUE;

-- Orphan detection (find active attachments without uploaded_at)
CREATE INDEX idx_attachments_incomplete_upload 
ON attachments(workspace_id, created_at)
WHERE uploaded_at IS NULL AND status = 'active';

-- GC: find soft-deleted items older than grace period
CREATE INDEX idx_attachments_soft_deleted_older_than 
ON attachments(workspace_id, soft_deleted_at)
WHERE status = 'soft_deleted' AND soft_deleted_at < now() - INTERVAL '30 days';

-- Version history queries
CREATE INDEX idx_attachment_version_history_attachment 
ON attachment_version_history(attachment_id, version_number DESC);

CREATE INDEX idx_attachment_version_history_actor 
ON attachment_version_history(actor_id, created_at DESC);

-- Locks: cleanup expired locks
CREATE INDEX idx_attachment_locks_expired 
ON attachment_locks(expires_at)
WHERE deleted_at IS NULL;

-- Orphan markers: find ones ready for deletion
CREATE INDEX idx_orphan_markers_ready_for_deletion 
ON attachment_orphan_markers(workspace_id, scheduled_for_deletion)
WHERE deleted_at IS NULL;
```

---

## 3. Design Decisions & Rationale

### 3.1 MinIO-Specific Data (versionId, size, etag, last_modified)

**Decision:** Track these in PostgreSQL.

**Rationale:**
- **Reconciliation**: When MinIO is temporarily unreachable, we can detect drift by comparing stored etag/version with current MinIO state
- **Integrity checks**: Detect if a file was corrupted or modified outside Docmost
- **GC efficiency**: Know which versions to delete without calling MinIO List API on every GC run
- **Performance**: Avoid extra MinIO API calls for metadata; use cache
- **Eventual consistency**: Async reconciliation jobs can fix mismatches

**Trade-off:** Extra DB columns (7 bytes overhead per attachment for version_id + etag + last_modified), but worth it for resilience.

### 3.2 Soft-Delete vs Hard-Delete Strategy

**Decision:** Dual-stage deletion.

1. **Soft-delete (immediate):** User clicks delete → set `status='soft_deleted'`, record `soft_deleted_at` and `soft_deleted_by_id`. **Do NOT delete from MinIO yet.**
   - User can restore within grace period (configurable, default 30 days)
   - Minimal DB write
   - Zero risk of accidental loss

2. **Hard-delete (batch GC):** After grace period, background job runs and:
   - Verifies attachment is still marked `soft_deleted` (paranoid check)
   - Calls MinIO delete API (removes all versions if versioning enabled)
   - Sets `status='hard_deleted'` and `hard_deleted_at`
   - Optional: Don't delete DB record immediately; archive to a history table or mark for later cleanup

**Why this pattern:**
- **Safety**: User can restore for 30 days (configurable)
- **Compliance**: Audit log shows who deleted and when
- **Resilience**: If hard-delete fails, soft-deleted record still exists for retry
- **Space-efficient**: Eventually delete from DB after long enough (e.g., 90 days)

### 3.3 Path-Calculated vs Path-Stored

**Decision:** Store full `minio_path` in DB as UNIQUE constraint.

**Rationale:**
- **Orphan detection**: Query attachments with `SELECT * FROM attachments WHERE minio_path NOT IN (SELECT minio_path FROM orphan_markers)` to find mismatches
- **Rename/move handling**: When page is renamed, update `minio_path` via a database transaction; this atomically moves the reference
- **Query efficiency**: Avoid reconstructing path from workspace_id + space_path + page_path + filename_uuid; it's expensive
- **UNIQUE constraint**: Prevent duplicate uploads of same file to same location

**Path format:**
```
{workspace_id}/{space_id}/{page_id}/{parent_page_id}/{filename}-{uuid}.{ext}
```

Example:
```
workspace-123/space-456/page-789/subpage-012/document-550e8400-e29b-41d4-a716-446655440000.pdf
```

When page is renamed/moved, single UPDATE statement:
```sql
UPDATE attachments 
SET minio_path = REPLACE(minio_path, '/old-page-id/', '/new-page-id/'),
    needs_resync = TRUE
WHERE page_id = $1;
```

### 3.4 Attachment History Tracking

**Decision:** Use `attachment_version_history` table for full audit trail (optional but recommended).

**What to track:**
- Upload/replace events (with version_id from MinIO)
- Soft-delete events
- Restore events (if implemented)
- Metadata changes (mime type detection fixes, OCR updates, etc.)
- Who did it, when, and from where (IP, user agent)

**Benefits:**
- Compliance audits (HIPAA, GDPR)
- Debugging: "Why was this file deleted?"
- Restore workflows: Recover previous version
- Security: Detect mass-deletion attacks

**Cost:** One extra row per upload/delete; ~1KB per event.

### 3.5 Tracking Upload Completeness

**Decision:** Add `uploaded_at` and `needs_resync` flags.

**Logic:**
1. User starts upload → create record with `status='active'`, `file_size=NULL`, `uploaded_at=NULL`
2. Upload completes → set `file_size`, `uploaded_at=now()`, `minio_version_id`, `minio_etag`
3. If upload fails → delete the record OR leave with `uploaded_at=NULL` and retry
4. Background job detects records with `uploaded_at IS NULL AND created_at < now() - INTERVAL '1 hour'` and cleans up (orphan markers)

**Why track separately:** 
- Avoid calculating path from components every time
- Efficient queries for incomplete uploads
- Clear upload state machine

---

## 4. Critical Indexes Explained

### Why these specific indexes?

| Index | Use Case | Query | Notes |
|-------|----------|-------|-------|
| `idx_attachments_page_active` | List files on a page | `SELECT * FROM attachments WHERE page_id = $1 AND status = 'active' ORDER BY created_at DESC` | Most common query |
| `idx_attachments_space_active` | Space storage view | `SELECT * FROM attachments WHERE space_id = $1 AND status = 'active'` | Pre-filter by active before aggregating |
| `idx_attachments_workspace_active` | Workspace storage report | `SELECT SUM(file_size) FROM attachments WHERE workspace_id = $1 AND status = 'active'` | Filter active first (partial index) |
| `idx_attachments_soft_deleted` | Trash bin | `SELECT * FROM attachments WHERE workspace_id = $1 AND status = 'soft_deleted' ORDER BY soft_deleted_at DESC` | Users empty trash here |
| `idx_attachments_tsv` | Full-text search | `SELECT * FROM attachments WHERE tsv @@ plainto_tsquery('search_term') AND status = 'active'` | GIN index for fast text search |
| `idx_attachments_needs_resync` | Background reconciliation | `SELECT id, minio_path FROM attachments WHERE needs_resync = TRUE AND workspace_id = $1 LIMIT 100` | Async job runs this query |
| `idx_attachment_locks_expired` | Lock cleanup | `SELECT * FROM attachment_locks WHERE expires_at < now()` | Periodic purge of stale locks |
| `idx_orphan_markers_ready_for_deletion` | GC job | `SELECT minio_path FROM orphan_markers WHERE workspace_id = $1 AND scheduled_for_deletion < now() AND deleted_at IS NULL` | Daily GC runs this |

---

## 5. Garbage Collection Implementation

### 5.1 Daily GC Job (Delete Soft-Deleted Files)

```typescript
async function dailyGarbageCollection(workspaceId: UUID) {
  const gracePeriodDays = 30;  // Configurable per workspace
  
  // Find soft-deleted attachments older than grace period
  const orphans = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'minio_version_id', 'soft_deleted_at'])
    .where('status', '=', 'soft_deleted')
    .where('workspace_id', '=', workspaceId)
    .where('soft_deleted_at', '<', sql`now() - INTERVAL '${gracePeriodDays} days'`)
    .execute();
  
  for (const orphan of orphans) {
    try {
      // Hard delete from MinIO
      if (orphan.minio_version_id) {
        // If versioning enabled, delete specific version
        await minioClient.removeObject(
          `workspace-${workspaceId}`,
          orphan.minio_path,
          { versionId: orphan.minio_version_id }
        );
      } else {
        // Remove all versions
        await minioClient.removeObject(`workspace-${workspaceId}`, orphan.minio_path);
      }
      
      // Mark as hard-deleted in DB
      await db
        .updateTable('attachments')
        .set({
          status: 'hard_deleted',
          hard_deleted_at: new Date(),
          needs_resync: false
        })
        .where('id', '=', orphan.id)
        .execute();
    } catch (error) {
      logger.error(`Failed to delete ${orphan.minio_path}`, error);
      // Don't throw; continue with next orphan. Retry next day.
    }
  }
}
```

### 5.2 Monthly Version Cleanup Job

```typescript
async function monthlyVersionCleanup(workspaceId: UUID) {
  const retentionMonths = 3;  // Configurable per workspace
  
  // Find all attachments with versions older than retention period
  const attachments = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'minio_last_modified'])
    .where('workspace_id', '=', workspaceId)
    .where('status', '=', 'active')
    .execute();
  
  const bucket = `workspace-${workspaceId}`;
  const cutoffDate = new Date(Date.now() - retentionMonths * 30 * 24 * 60 * 60 * 1000);
  
  for (const att of attachments) {
    try {
      // List all versions of this object
      const versions = await minioClient.listObjectVersions(bucket, att.minio_path);
      
      for (const version of versions) {
        if (version.lastModified < cutoffDate && version.versionId !== att.minio_version_id) {
          // Delete old version (not current)
          await minioClient.removeObject(bucket, att.minio_path, {
            versionId: version.versionId
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup versions for ${att.minio_path}`, error);
    }
  }
}
```

### 5.3 Orphan Detection Job (Weekly)

```typescript
async function weeklyOrphanDetection(workspaceId: UUID) {
  const bucket = `workspace-${workspaceId}`;
  
  // List all objects in MinIO bucket
  const minioObjects = new Set<string>();
  const stream = minioClient.listObjects(bucket);
  
  stream.on('data', (obj) => {
    minioObjects.add(obj.name);
  });
  
  await new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  
  // Find all paths in DB (including soft-deleted)
  const dbPaths = await db
    .selectFrom('attachments')
    .select('minio_path')
    .where('workspace_id', '=', workspaceId)
    .execute();
  
  const dbPathSet = new Set(dbPaths.map(r => r.minio_path));
  
  // Find orphans (in MinIO but not in DB)
  const orphanPaths = Array.from(minioObjects).filter(p => !dbPathSet.has(p));
  
  // Mark for deletion (with grace period)
  for (const path of orphanPaths) {
    try {
      await db
        .insertInto('attachment_orphan_markers')
        .values({
          workspace_id: workspaceId,
          minio_path: path,
          discovered_at: new Date(),
          scheduled_for_deletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7-day grace
        })
        .onConflict((oc) => oc.column('minio_path').doUpdateSet({
          discovered_at: new Date(),
          deletion_attempt_count: sql`deletion_attempt_count + 1`
        }))
        .execute();
    } catch (error) {
      logger.error(`Failed to mark orphan ${path}`, error);
    }
  }
}
```

### 5.4 Orphan Hard-Deletion Job (Daily)

```typescript
async function orphanHardDeletion(workspaceId: UUID) {
  const bucket = `workspace-${workspaceId}`;
  
  // Find orphans ready for deletion
  const orphans = await db
    .selectFrom('attachment_orphan_markers')
    .select(['id', 'minio_path', 'minio_version_id'])
    .where('workspace_id', '=', workspaceId)
    .where('scheduled_for_deletion', '<', sql`now()`)
    .where('deleted_at', 'is', null)
    .execute();
  
  for (const orphan of orphans) {
    try {
      await minioClient.removeObject(bucket, orphan.minio_path, {
        versionId: orphan.minio_version_id
      });
      
      await db
        .updateTable('attachment_orphan_markers')
        .set({ deleted_at: new Date() })
        .where('id', '=', orphan.id)
        .execute();
    } catch (error) {
      logger.error(`Failed to delete orphan ${orphan.minio_path}`, error);
      
      // Record error and increment retry count
      await db
        .updateTable('attachment_orphan_markers')
        .set({
          last_deletion_error: error.message,
          deletion_attempt_count: sql`deletion_attempt_count + 1`
        })
        .where('id', '=', orphan.id)
        .execute();
      
      // Stop trying after 10 attempts
      const marker = await db
        .selectFrom('attachment_orphan_markers')
        .select('deletion_attempt_count')
        .where('id', '=', orphan.id)
        .executeTakeFirst();
      
      if (marker?.deletion_attempt_count >= 10) {
        logger.warn(`Giving up on orphan ${orphan.minio_path} after 10 attempts`);
      }
    }
  }
}
```

---

## 6. Handling Page Renames/Moves

### When Page is Renamed

```typescript
async function renamePage(pageId: UUID, newTitle: string) {
  // Transaction ensures atomicity
  return await db.transaction().execute(async (trx) => {
    // 1. Acquire lock
    const lockId = await acquireLock(trx, 'page_rename', pageId, sessionId);
    
    try {
      // 2. Update page
      const page = await trx
        .updateTable('pages')
        .set({ title: newTitle, updated_at: new Date() })
        .where('id', '=', pageId)
        .returning('*')
        .executeTakeFirst();
      
      // 3. Update attachment paths (no MinIO operation needed here!)
      // The path is just metadata; MinIO object doesn't move
      const oldSpaceId = page.space_id;
      const newSpaceId = page.space_id;  // (in this case, same)
      
      await trx
        .updateTable('attachments')
        .set({
          needs_resync: true,  // Flag for async reconciliation
          updated_at: new Date()
        })
        .where('page_id', '=', pageId)
        .execute();
      
      // 4. Async reconciliation job will verify path is consistent
      return page;
    } finally {
      await releaseLock(trx, lockId);
    }
  });
}
```

### When Page is Moved (Parent Changed)

```typescript
async function movePageToParent(pageId: UUID, newParentId: UUID | null) {
  return await db.transaction().execute(async (trx) => {
    const lockId = await acquireLock(trx, 'page_move', pageId, sessionId);
    
    try {
      await trx
        .updateTable('pages')
        .set({ parent_page_id: newParentId, updated_at: new Date() })
        .where('id', '=', pageId)
        .execute();
      
      // Update parent_page_id in attachments (denormalized for queries)
      await trx
        .updateTable('attachments')
        .set({
          parent_page_id: newParentId,
          needs_resync: true,
          updated_at: new Date()
        })
        .where('page_id', '=', pageId)
        .execute();
      
      return true;
    } finally {
      await releaseLock(trx, lockId);
    }
  });
}
```

---

## 7. Concurrent Upload Handling

### Upload Flow (Idempotent)

```typescript
async function uploadAttachment(
  workspaceId: UUID,
  spaceId: UUID,
  pageId: UUID,
  parentPageId: UUID | null,
  file: File,
  sessionId: string
) {
  const fileId = generateUUID();
  const minio_path = `${workspaceId}/${spaceId}/${pageId}/${parentPageId || 'null'}/${file.name}-${fileId}.${getExtension(file.name)}`;
  
  // Acquire lock to prevent concurrent upload of same file
  const lockId = await acquireLock('attachment', pageId, sessionId, {
    expiresIn: 5 * 60 * 1000  // 5 minute timeout
  });
  
  try {
    // 1. Create DB record (incomplete upload)
    const attachment = await db
      .insertInto('attachments')
      .values({
        id: fileId,
        minio_path,
        filename: file.name,
        file_ext: getExtension(file.name),
        mime_type: file.type,
        workspace_id: workspaceId,
        space_id: spaceId,
        page_id: pageId,
        parent_page_id: parentPageId,
        creator_id: userId,
        status: 'active',
        file_size: null,
        uploaded_at: null,
        created_at: new Date()
      })
      .returning('*')
      .executeTakeFirst();
    
    // 2. Upload to MinIO (streaming)
    const putObjectResponse = await minioClient.putObject(
      `workspace-${workspaceId}`,
      minio_path,
      file.stream(),
      file.size,
      {
        'Content-Type': file.type
      }
    );
    
    // 3. Mark upload as complete
    const updated = await db
      .updateTable('attachments')
      .set({
        file_size: file.size,
        uploaded_at: new Date(),
        minio_version_id: putObjectResponse.versionId,
        minio_etag: putObjectResponse.etag,
        minio_last_modified: new Date(),
        needs_resync: false
      })
      .where('id', '=', fileId)
      .returning('*')
      .executeTakeFirst();
    
    return updated;
  } catch (error) {
    // On error, leave incomplete record for cleanup job
    logger.error(`Upload failed for ${minio_path}`, error);
    throw error;
  } finally {
    await releaseLock(lockId);
  }
}
```

---

## 8. Gotchas & Mitigation

### 8.1 MinIO Versioning Complexity

**Gotcha:** If versioning is enabled, every overwrite creates a new version. `file_size` becomes ambiguous (current size or all versions combined?).

**Mitigation:**
- Always store the current version's size in `minio_last_modified` and `minio_version_id`
- For storage reports, only sum file_size of active attachments (ignore soft-deleted)
- Monthly job deletes old versions to avoid version explosion

### 8.2 Concurrent Uploads of Same File

**Gotcha:** Two users simultaneously upload `document.pdf` to the same page.

**Mitigation:**
- Lock by (page_id, filename) pair
- OR generate UUIDs in filename to make each upload unique
- Check if file already exists before acquiring lock

### 8.3 Page Deletion Cascades

**Gotcha:** When page is deleted, `ON DELETE CASCADE` removes all attachments. But what about MinIO?

**Mitigation:**
- Add a trigger that sets attachments to soft_deleted when page is deleted:

```sql
CREATE TRIGGER cascade_page_delete_to_attachments
AFTER DELETE ON pages
FOR EACH ROW
BEGIN
  UPDATE attachments
  SET status = 'soft_deleted',
      soft_deleted_at = now(),
      soft_deleted_by_id = NULL  -- System delete
  WHERE page_id = OLD.id AND status = 'active';
END;
```

Then GC cleans up MinIO objects after grace period.

### 8.4 Workspace Deletion = Mass Data Loss

**Gotcha:** Deleting a workspace cascades to all attachments. GC must complete before user re-creates workspace with same name.

**Mitigation:**
- Add workspace-level flag `scheduled_for_final_deletion`
- GC runs in three phases: soft-delete attachments → wait 30 days → hard-delete MinIO objects → allow workspace re-creation
- Alert user during deletion: "Your data will be permanently deleted in 30 days."

### 8.5 Incomplete Uploads Accumulate

**Gotcha:** If upload crashes mid-stream, DB record has `uploaded_at=NULL` forever. Orphan detection misses it (it's in DB).

**Mitigation:**
- Query for `uploaded_at IS NULL AND created_at < now() - INTERVAL '1 hour'` → mark as orphan
- Background job cleans up MinIO objects not matching any DB record

### 8.6 Lock Contention During Mass Rename

**Gotcha:** Renaming space with 10,000 pages → 10,000 attachment updates locks them all.

**Mitigation:**
- Batch updates in chunks of 1000
- Set `needs_resync=true` instead of locking; async job verifies paths later
- Or use a distributed lock (Redis) instead of DB rows

### 8.7 Search Queries Slow on Large Workspaces

**Gotcha:** Full-text search across 1M attachments requires rescanning entire table.

**Mitigation:**
- Partial index on active attachments only: `WHERE status = 'active'`
- Add workspace filter to every search query
- Consider denormalizing to a search index (Elasticsearch) for large workspaces

### 8.8 Storage Quota Bypass

**Gotcha:** User uploads to MinIO, then DB crashes before record is persisted. File exists in MinIO but not counted in storage quota.

**Mitigation:**
- Before counting toward quota, verify `uploaded_at IS NOT NULL`
- Reconciliation job finds orphans and either deletes or creates records for them
- Provide admin API to reconcile: `POST /admin/workspaces/{id}/reconcile-attachments`

---

## 9. Migration Strategy

### Phase 1: Schema Addition (Non-Breaking)

Create new tables without modifying existing `attachments` table.

```sql
-- Migration: 20250901T090000-minio-attachment-refactor.ts

CREATE TABLE attachment_version_history (
  -- ... (from section 1.2)
);

CREATE TABLE attachment_locks (
  -- ... (from section 1.3)
);

CREATE TABLE attachment_orphan_markers (
  -- ... (from section 1.4)
);

-- Add columns to existing attachments table
ALTER TABLE attachments
ADD COLUMN IF NOT EXISTS minio_path VARCHAR UNIQUE,
ADD COLUMN IF NOT EXISTS minio_version_id VARCHAR,
ADD COLUMN IF NOT EXISTS minio_etag VARCHAR,
ADD COLUMN IF NOT EXISTS minio_last_modified TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active',
ADD COLUMN IF NOT EXISTS soft_deleted_by_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS hard_deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS needs_resync BOOLEAN DEFAULT FALSE;

-- Backfill soft_deleted_at from deleted_at (if exists)
UPDATE attachments
SET soft_deleted_at = deleted_at
WHERE deleted_at IS NOT NULL AND soft_deleted_at IS NULL;

-- Backfill status
UPDATE attachments
SET status = 'soft_deleted'
WHERE soft_deleted_at IS NOT NULL;

-- Backfill minio_path (calculate from existing data)
UPDATE attachments a
SET minio_path = CONCAT(
  a.workspace_id, '/',
  a.space_id, '/',
  a.page_id, '/',
  COALESCE(p.parent_page_id::text, 'null'), '/',
  a.file_name
)
FROM pages p
WHERE a.page_id = p.id AND a.minio_path IS NULL;

-- Backfill uploaded_at (assume old records completed)
UPDATE attachments
SET uploaded_at = created_at
WHERE uploaded_at IS NULL AND status != 'soft_deleted';

-- Add constraints after backfill
ALTER TABLE attachments
ADD CONSTRAINT valid_status CHECK (status IN ('active', 'soft_deleted', 'hard_deleted')),
ADD CONSTRAINT soft_delete_coherent CHECK (
  (status != 'soft_deleted' AND soft_deleted_at IS NULL) OR
  (status = 'soft_deleted' AND soft_deleted_at IS NOT NULL)
),
ADD CONSTRAINT hard_delete_coherent CHECK (
  (status != 'hard_deleted' AND hard_deleted_at IS NULL) OR
  (status = 'hard_deleted' AND hard_deleted_at IS NOT NULL)
),
ADD CONSTRAINT upload_complete_or_null CHECK (
  (file_size IS NOT NULL AND uploaded_at IS NOT NULL) OR
  (file_size IS NULL AND uploaded_at IS NULL)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_attachments_page_active 
ON attachments(page_id, created_at DESC) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_attachments_space_active 
ON attachments(space_id, created_at DESC) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_attachments_workspace_active 
ON attachments(workspace_id, created_at DESC) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_attachments_soft_deleted 
ON attachments(workspace_id, soft_deleted_at DESC)
WHERE status = 'soft_deleted';

CREATE INDEX IF NOT EXISTS idx_attachments_needs_resync 
ON attachments(workspace_id, needs_resync)
WHERE needs_resync = TRUE;

CREATE INDEX IF NOT EXISTS idx_attachment_version_history_attachment 
ON attachment_version_history(attachment_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_orphan_markers_ready_for_deletion 
ON attachment_orphan_markers(workspace_id, scheduled_for_deletion)
WHERE deleted_at IS NULL;
```

### Phase 2: Background Reconciliation

Verify paths in MinIO match DB records. Run async job:

```typescript
async function reconcileAttachmentPaths() {
  const attachments = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'workspace_id'])
    .where('needs_resync', '=', true)
    .limit(100)
    .execute();
  
  for (const att of attachments) {
    try {
      const stat = await minioClient.statObject(
        `workspace-${att.workspace_id}`,
        att.minio_path
      );
      
      await db
        .updateTable('attachments')
        .set({
          minio_version_id: stat.versionId,
          minio_etag: stat.etag,
          minio_last_modified: stat.lastModified,
          last_synced_at: new Date(),
          needs_resync: false
        })
        .where('id', '=', att.id)
        .execute();
    } catch (error) {
      if (error.code === 'NotFound') {
        // Mark as orphan
        await db
          .insertInto('attachment_orphan_markers')
          .values({
            workspace_id: att.workspace_id,
            minio_path: att.minio_path,
            discovered_at: new Date(),
            scheduled_for_deletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
          .onConflict(oc => oc.column('minio_path').doNothing())
          .execute();
      }
    }
  }
}
```

### Phase 3: Cleanup Old Code

Remove old `deleted_at` column and references after migration is verified:

```sql
ALTER TABLE attachments
DROP CONSTRAINT IF EXISTS "attachments_deleted_at_check",
DROP COLUMN IF EXISTS deleted_at;
```

---

## 10. Query Examples

### List active attachments on a page

```sql
SELECT * FROM attachments
WHERE page_id = $1
  AND status = 'active'
  AND workspace_id = $2
ORDER BY created_at DESC;
```

### Search attachments in workspace

```sql
SELECT * FROM attachments
WHERE workspace_id = $1
  AND status = 'active'
  AND tsv @@ plainto_tsquery('search_term')
ORDER BY created_at DESC;
```

### Calculate workspace storage usage

```sql
SELECT 
  workspace_id,
  SUM(file_size) as total_bytes,
  COUNT(*) as file_count
FROM attachments
WHERE status = 'active'
GROUP BY workspace_id;
```

### Find incomplete uploads (potential orphans)

```sql
SELECT id, filename, created_at
FROM attachments
WHERE uploaded_at IS NULL
  AND status = 'active'
  AND created_at < now() - INTERVAL '1 hour'
  AND workspace_id = $1;
```

### Trash bin: list soft-deleted files

```sql
SELECT * FROM attachments
WHERE workspace_id = $1
  AND status = 'soft_deleted'
ORDER BY soft_deleted_at DESC;
```

### Audit trail: who deleted what when

```sql
SELECT 
  ah.action,
  ah.actor_id,
  u.name as actor_name,
  ah.created_at,
  a.filename
FROM attachment_version_history ah
JOIN users u ON ah.actor_id = u.id
JOIN attachments a ON ah.attachment_id = a.id
WHERE a.workspace_id = $1
  AND ah.action IN ('soft_deleted', 'restored')
ORDER BY ah.created_at DESC;
```

---

## 11. Performance Recommendations

### Connection Pool Settings
- Min: 5 connections
- Max: 20 connections  
- Idle timeout: 30 seconds

### Query Optimization Tips
1. Always filter by `status = 'active'` before other conditions
2. Add `workspace_id` to every query (shard-friendly)
3. Use `LIMIT` on deletion queries (batch in 1000-record chunks)
4. Use partial indexes to exclude soft-deleted rows from scans

### Caching Strategy
- Cache file_size per workspace (invalidate on upload/delete)
- Cache attachment count per page (invalidate on upload/delete)
- Cache file metadata (mime_type, etag) in Redis with 1-hour TTL

### Monitoring
- Alert if `attachment_orphan_markers` grows faster than GC cleans up
- Alert if `needs_resync` count exceeds 10% of total attachments
- Monitor lock contention: if locks expire frequently, increase timeout

---

## Conclusion

This schema provides:

✅ **Resilience**: Soft-delete + hard-delete + orphan detection  
✅ **Auditability**: Full version history and who-did-what tracking  
✅ **Performance**: Partial indexes, denormalized paths, minimal locks  
✅ **Consistency**: Constraints and triggers keep DB ↔ MinIO in sync  
✅ **Scalability**: Batch GC jobs, async reconciliation, shard-friendly queries  

The design prioritizes **minimal metadata** in PostgreSQL while maintaining **eventual consistency** with MinIO through asynchronous reconciliation and garbage collection.
