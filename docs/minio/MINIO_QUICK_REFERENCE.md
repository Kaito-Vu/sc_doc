# MinIO Attachment Schema - Quick Reference

Fast lookup guide for developers and database architects.

---

## Table Structure at a Glance

### `attachments` (Enhanced)

```
ID COLUMN                       TYPE          PURPOSE
─────────────────────────────────────────────────────────
id                              UUID          Primary key
minio_path                      VARCHAR       Full path in MinIO bucket (UNIQUE)
filename                        VARCHAR       Original filename
file_ext                        VARCHAR       Extension (.pdf, .jpg)
file_size                       INT8          File size in bytes (NULL if uploading)
mime_type                       VARCHAR       MIME type (application/pdf)
workspace_id                    UUID          Workspace (FK, CASCADE)
space_id                        UUID          Space (FK, CASCADE)
page_id                         UUID          Page (FK, CASCADE)
parent_page_id                  UUID          Subpage parent (denormalized)
creator_id                      UUID          Who uploaded (FK)
minio_version_id                VARCHAR       Version ID from MinIO
minio_etag                      VARCHAR       ETag for integrity checks
minio_last_modified             TIMESTAMPTZ   Last modified in MinIO
status                          VARCHAR       active | soft_deleted | hard_deleted
soft_deleted_at                 TIMESTAMPTZ   When user deleted
soft_deleted_by_id              UUID          Who deleted
hard_deleted_at                 TIMESTAMPTZ   When GC removed
uploaded_at                     TIMESTAMPTZ   When upload completed
last_synced_at                  TIMESTAMPTZ   Last reconciliation check
needs_resync                    BOOLEAN       Flag for async reconciliation
text_content                    TEXT          OCR'd/extracted text
tsv                             TSVECTOR      Full-text search
created_at                      TIMESTAMPTZ   Created timestamp
updated_at                      TIMESTAMPTZ   Updated timestamp
```

### `attachment_version_history` (NEW)

```
ID COLUMN                       TYPE          PURPOSE
─────────────────────────────────────────────────────────
id                              UUID          Primary key
attachment_id                   UUID          Reference (FK CASCADE)
minio_version_id                VARCHAR       MinIO version ID
version_number                  INT           Local version counter (1, 2, 3...)
action                          VARCHAR       uploaded | replaced | soft_deleted | restored | metadata_updated
actor_id                        UUID          Who did it (FK)
file_size                       INT8          Size at this version
mime_type                       VARCHAR       MIME type at this version
minio_etag                      VARCHAR       ETag at this version
change_reason                   TEXT          Why (optional)
ip_address                      INET          Source IP (optional)
user_agent                      VARCHAR       Browser/client (optional)
created_at                      TIMESTAMPTZ   Timestamp
```

### `attachment_locks` (NEW)

```
ID COLUMN                       TYPE          PURPOSE
─────────────────────────────────────────────────────────
id                              UUID          Primary key
locked_resource_type            VARCHAR       attachment | page_rename | page_move
locked_resource_id              UUID          Which resource is locked
holder_session_id               VARCHAR       Session/request ID of lock holder
created_at                      TIMESTAMPTZ   Lock acquired time
expires_at                      TIMESTAMPTZ   Lock auto-expires (5 min default)
```

### `attachment_orphan_markers` (NEW)

```
ID COLUMN                       TYPE          PURPOSE
─────────────────────────────────────────────────────────
id                              UUID          Primary key
workspace_id                    UUID          Which workspace (FK CASCADE)
minio_path                      VARCHAR       Path in MinIO (UNIQUE)
minio_version_id                VARCHAR       Version ID (if any)
discovered_at                   TIMESTAMPTZ   When orphan was found
scheduled_for_deletion          TIMESTAMPTZ   When to hard-delete (now + 7 days)
deletion_attempt_count          INT           How many times we tried to delete
last_deletion_error             TEXT          Error message (for debugging)
deleted_at                      TIMESTAMPTZ   When hard-deleted
```

---

## Critical Queries

### List Active Attachments on Page
```sql
SELECT * FROM attachments
WHERE page_id = $1 AND status = 'active'
ORDER BY created_at DESC;
```

### Search Attachments in Workspace
```sql
SELECT * FROM attachments
WHERE workspace_id = $1
  AND status = 'active'
  AND tsv @@ plainto_tsquery($2)
ORDER BY created_at DESC;
```

### Workspace Storage Report
```sql
SELECT 
  SUM(file_size) as total_bytes,
  COUNT(*) as file_count,
  MAX(created_at) as last_upload
FROM attachments
WHERE workspace_id = $1 AND status = 'active';
```

### Find Items Needing Resync
```sql
SELECT id, minio_path, workspace_id
FROM attachments
WHERE needs_resync = TRUE
  AND workspace_id = $1
LIMIT 100;
```

### List Soft-Deleted (Trash Bin)
```sql
SELECT * FROM attachments
WHERE workspace_id = $1
  AND status = 'soft_deleted'
ORDER BY soft_deleted_at DESC
LIMIT 100;
```

### Find Soft-Deleted Older Than Grace Period
```sql
SELECT id, minio_path, soft_deleted_at
FROM attachments
WHERE status = 'soft_deleted'
  AND workspace_id = $1
  AND soft_deleted_at < now() - INTERVAL '30 days'
LIMIT 100;
```

### Audit Trail (Who Deleted What When)
```sql
SELECT 
  ah.action,
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

### Find Incomplete Uploads (Orphan Detection)
```sql
SELECT id, filename, created_at
FROM attachments
WHERE uploaded_at IS NULL
  AND status = 'active'
  AND created_at < now() - INTERVAL '1 hour'
  AND workspace_id = $1;
```

### Count Items Needing Resync
```sql
SELECT COUNT(*) as resync_count
FROM attachments
WHERE needs_resync = TRUE AND workspace_id = $1;
```

---

## Indexes (What Gets Created)

| Index Name | Columns | Partial? | Use Case |
|------------|---------|----------|----------|
| `idx_attachments_page_active` | page_id, created_at DESC | WHERE status='active' | List page attachments |
| `idx_attachments_space_active` | space_id, created_at DESC | WHERE status='active' | Space view |
| `idx_attachments_workspace_active` | workspace_id, created_at DESC | WHERE status='active' | Workspace storage |
| `idx_attachments_creator_workspace` | creator_id, workspace_id, created_at DESC | WHERE status='active' | User's uploads |
| `idx_attachments_soft_deleted` | workspace_id, soft_deleted_at DESC | WHERE status='soft_deleted' | Trash bin |
| `idx_attachments_soft_deleted_older_than` | workspace_id, soft_deleted_at | WHERE status='soft_deleted' AND soft_deleted_at < now()-30d | GC job |
| `idx_attachments_needs_resync` | workspace_id, needs_resync | WHERE needs_resync=TRUE | Reconciliation |
| `idx_attachments_incomplete_upload` | workspace_id, created_at | WHERE uploaded_at IS NULL AND status='active' | Orphan detection |
| `idx_attachments_tsv` | tsv | GIN | Full-text search |
| `idx_attachments_workspace_id` | workspace_id | Full | FK cascade |
| `idx_attachments_page_id` | page_id | Full | FK cascade |
| `idx_attachments_space_id` | space_id | Full | FK cascade |

---

## State Machine

### Attachment Lifecycle

```
┌─────────────┐
│  CREATED    │  user initiates upload
│ (file_size  │
│  is NULL)   │
└──────┬──────┘
       │ upload succeeds
       │ (file_size set, uploaded_at set)
       ▼
┌─────────────┐
│   ACTIVE    │  normal state
│ (status =   │
│ 'active')   │
└──────┬──────┘
       │ user clicks delete
       │ (set status='soft_deleted', soft_deleted_at=now())
       ▼
┌──────────────────┐
│   SOFT_DELETED   │  user can restore within 30 days
│   (status =      │
│  'soft_deleted') │
└──────┬───────────┘
       │ after 30 days (grace period)
       │ GC runs: deletes from MinIO, sets hard_deleted_at
       ▼
┌──────────────────┐
│  HARD_DELETED    │  permanently removed
│  (status =       │
│ 'hard_deleted')  │
└──────────────────┘
```

### Upload State Machine

```
                  Uploading
                  ┌─────────┐
                  │ POST    │
                  │ /upload │
                  └────┬────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
   ┌─────────────┐           ┌──────────────┐
   │ CREATED     │           │ FAILED       │
   │ file_size=0 │           │ (deleted     │
   │ uploaded_at │           │ after 1hr)   │
   │ = NULL      │           └──────────────┘
   └─────┬───────┘
         │ streaming completes
         │ file_size set, uploaded_at set
         ▼
   ┌─────────────┐
   │ COMPLETED   │
   │ file_size > │
   │ 0, ready    │
   │ for use     │
   └─────────────┘
```

---

## Constraints

```sql
-- Status is valid value
CHECK (status IN ('active', 'soft_deleted', 'hard_deleted'))

-- If soft_deleted, then soft_deleted_at must be set
CHECK (
  (status != 'soft_deleted' AND soft_deleted_at IS NULL) OR
  (status = 'soft_deleted' AND soft_deleted_at IS NOT NULL)
)

-- If hard_deleted, then hard_deleted_at must be set
CHECK (
  (status != 'hard_deleted' AND hard_deleted_at IS NULL) OR
  (status = 'hard_deleted' AND hard_deleted_at IS NOT NULL)
)

-- If file_size is set, uploaded_at must be set (and vice versa)
CHECK (
  (file_size IS NOT NULL AND uploaded_at IS NOT NULL) OR
  (file_size IS NULL AND uploaded_at IS NULL)
)

-- minio_path is unique per workspace
UNIQUE (minio_path)
```

---

## Common Patterns

### Upload File
```typescript
async function upload(file, workspaceId, pageId, userId, sessionId) {
  const lockId = await acquireLock('attachment', pageId, sessionId);
  try {
    // 1. Create record (incomplete)
    const att = await db.insertInto('attachments').values({...}).returning('*');
    
    // 2. Upload to MinIO
    const resp = await minioClient.putObject(bucket, minioPath, ...);
    
    // 3. Mark complete
    await db.updateTable('attachments')
      .set({
        file_size: file.size,
        uploaded_at: new Date(),
        minio_version_id: resp.versionId,
        minio_etag: resp.etag
      })
      .where('id', '=', att.id)
      .execute();
  } finally {
    await releaseLock(lockId);
  }
}
```

### Soft-Delete
```typescript
async function softDelete(attachmentId, userId) {
  await db.updateTable('attachments')
    .set({
      status: 'soft_deleted',
      soft_deleted_at: new Date(),
      soft_deleted_by_id: userId
    })
    .where('id', '=', attachmentId)
    .execute();
  
  // Record in history
  await db.insertInto('attachment_version_history').values({
    attachment_id: attachmentId,
    action: 'soft_deleted',
    actor_id: userId,
    version_number: 1
  }).execute();
}
```

### Restore from Trash
```typescript
async function restore(attachmentId, userId) {
  await db.updateTable('attachments')
    .set({
      status: 'active',
      soft_deleted_at: null,
      soft_deleted_by_id: null
    })
    .where('id', '=', attachmentId)
    .execute();
  
  await db.insertInto('attachment_version_history').values({
    attachment_id: attachmentId,
    action: 'restored',
    actor_id: userId
  }).execute();
}
```

### Hard-Delete (GC)
```typescript
async function hardDelete(attachmentId) {
  const att = await db.selectFrom('attachments')
    .where('id', '=', attachmentId)
    .executeTakeFirst();
  
  await minioClient.removeObject(bucket, att.minio_path);
  
  await db.updateTable('attachments')
    .set({
      status: 'hard_deleted',
      hard_deleted_at: new Date()
    })
    .where('id', '=', attachmentId)
    .execute();
}
```

### Flag for Resync
```typescript
// When page is renamed
await db.updateTable('attachments')
  .set({ needs_resync: true })
  .where('page_id', '=', pageId)
  .execute();

// Async job later:
const items = await db.selectFrom('attachments')
  .where('needs_resync', '=', true)
  .execute();

for (const item of items) {
  const stat = await minioClient.statObject(bucket, item.minio_path);
  await db.updateTable('attachments')
    .set({
      minio_version_id: stat.versionId,
      minio_etag: stat.etag,
      minio_last_modified: stat.lastModified,
      needs_resync: false
    })
    .where('id', '=', item.id)
    .execute();
}
```

---

## Gotchas & Fixes

### ❌ Orphaned Locks
**Symptom:** Uploads fail with "Resource is locked"  
**Fix:** `DELETE FROM attachment_locks WHERE expires_at < now();`

### ❌ Many Incomplete Uploads
**Symptom:** DB filling up with files that never finished  
**Fix:** Background job deletes attachments with `uploaded_at IS NULL` older than 1 hour

### ❌ Orphan Markers Accumulating
**Symptom:** `attachment_orphan_markers` table growing  
**Fix:** Ensure `deleteOrphanedObjects()` job is running daily

### ❌ Search Queries Slow
**Symptom:** Full-text search hangs on large workspaces  
**Fix:** Rebuild GIN index: `REINDEX INDEX idx_attachments_tsv;`

### ❌ Missing minio_path
**Symptom:** Queries fail; data from old migration incomplete  
**Fix:** `UPDATE attachments SET minio_path = ... WHERE minio_path IS NULL;`

### ❌ needs_resync Flag Stuck
**Symptom:** Many attachments stuck with `needs_resync = TRUE`  
**Fix:** Reconciliation job failing; check logs, manual restart: `SELECT reconcileAttachmentPaths($workspaceId);`

---

## Performance Tips

| Tip | Benefit |
|-----|---------|
| Always filter by `status = 'active'` before other conditions | Partial indexes kick in; 3x faster |
| Include `workspace_id` in every query | Enables sharding; shard-local queries are fast |
| Use `LIMIT` in deletion queries; batch in 1000s | Avoid long transactions; prevents lock exhaustion |
| Cache `file_size` per workspace (invalidate on upload/delete) | Storage reports no longer require full scan |
| Use partial indexes; don't use full-table indexes for active queries | Smaller index = better cache hit |
| For soft-deleted queries, separate index from active index | Don't bloat the active index |

---

## Migration Checklist

- [ ] Run migration: `npm run migrate:latest`
- [ ] Backfill `minio_path` for all existing attachments
- [ ] Backfill `uploaded_at` for all existing attachments
- [ ] Verify no NULL values in required columns
- [ ] Enable background jobs (GC, reconciliation, lock cleanup)
- [ ] Monitor: `SELECT COUNT(*) FROM attachments WHERE needs_resync = TRUE;`
- [ ] Monitor: `SELECT COUNT(*) FROM attachment_orphan_markers WHERE deleted_at IS NULL;`
- [ ] Verify GC job ran: check if soft-deleted older than 30 days were hard-deleted
- [ ] Test upload → delete → restore flow
- [ ] Test concurrent uploads to same page (lock mechanism)
- [ ] Test page rename (mark needs_resync, verify reconciliation)

---

## Files to Review

| Document | Purpose |
|----------|---------|
| `MINIO_ATTACHMENT_SCHEMA_DESIGN.md` | Full design (8 questions answered) |
| `MINIO_IMPLEMENTATION_GUIDE.md` | How to implement services & APIs |
| `MINIO_SCHEMA_DECISIONS_REFERENCE.md` | Trade-off analysis for each decision |
| `MINIO_QUICK_REFERENCE.md` | This file; quick lookup |
| `20260630T000001-minio-attachment-schema.ts` | Migration file to apply |

---

## Questions?

- **Schema design**: See `MINIO_ATTACHMENT_SCHEMA_DESIGN.md`
- **Implementation**: See `MINIO_IMPLEMENTATION_GUIDE.md`
- **Trade-offs**: See `MINIO_SCHEMA_DECISIONS_REFERENCE.md`
- **Quick lookup**: You're reading it!
