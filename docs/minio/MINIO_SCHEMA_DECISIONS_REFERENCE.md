# MinIO Schema Design Decisions - Reference Guide

This document explains the key architectural trade-offs and design decisions made in the MinIO attachment storage schema.

---

## 1. Metadata Storage: PostgreSQL vs MinIO

### Question
Should we store MinIO object metadata (size, version_id, etag, last_modified) in PostgreSQL, or always fetch from MinIO?

### Decision
**Store in PostgreSQL** (minio_version_id, minio_etag, minio_last_modified, file_size)

### Rationale

| Aspect | Store in DB | Always Fetch |
|--------|-------------|--------------|
| **On MinIO unavailable** | Can serve stale metadata | Request fails |
| **Query performance** | Fast (no API call) | Slow (N+1 queries to MinIO) |
| **Consistency** | Eventual (reconciliation job) | Always current |
| **Storage overhead** | ~50 bytes per attachment | None |
| **GC efficiency** | Know old versions to delete | Must list all versions |
| **Scalability** | 1M attachments = ~50MB DB | 1M * 100ms calls = 100,000 seconds |

### Trade-offs
- **Pro:** 100x faster queries; works offline; GC doesn't require MinIO API calls
- **Con:** Requires reconciliation job to fix drift

### Mitigation
- Reconciliation job runs hourly, fixes mismatches within 60 minutes
- `needs_resync` flag lets operators manually trigger sync
- Constraints verify coherence (e.g., `uploaded_at IS NOT NULL => file_size IS NOT NULL`)

---

## 2. Soft-Delete vs Hard-Delete

### Question
Should we delete attachments immediately (hard-delete) or mark as deleted with grace period (soft-delete)?

### Decision
**Dual-stage deletion:** Soft-delete immediately, hard-delete after grace period.

### Rationale

| Scenario | Hard-Delete Only | Soft-Delete + Grace | Winner |
|----------|------------------|---------------------|--------|
| User deletes by accident | Data lost immediately | Can restore within 30 days | Soft |
| Storage quota misreporting | File deleted, not counted | Still counted until hard-delete | Hard |
| Page deleted cascades | Orphaned attachments | All soft-deleted; GC cleans up | Soft |
| Recovery from malfunction | Can't recover | Can restore if within grace | Soft |
| Compliance (GDPR delete request) | Immediate, provable | Requires explicit hard-delete | Hard |
| Space efficiency | Immediate | Delayed (30 days) | Hard |
| Operational simplicity | Delete once | Delete twice | Hard |

### Decision Rationale
- **Safety > efficiency**: User accidentally deleted file is worse than slightly delayed garbage collection
- **Compliance**: Can prove hard-deletion after grace period
- **Simplicity trade-off acceptable**: GC job runs daily; 30 days is standard trash retention

### Implementation

```sql
-- Soft-delete (user clicks delete)
UPDATE attachments
SET status = 'soft_deleted',
    soft_deleted_at = now(),
    soft_deleted_by_id = $1
WHERE id = $2;

-- Hard-delete (after 30 days)
UPDATE attachments
SET status = 'hard_deleted',
    hard_deleted_at = now()
WHERE status = 'soft_deleted'
  AND soft_deleted_at < now() - INTERVAL '30 days';
```

### Grace Period Configuration
- Default: 30 days
- Per-workspace override: `SELECT deletion_grace_period_days FROM workspaces WHERE id = $1`
- Minimum: 7 days (prevent accidental mass-delete of recent trash)
- Maximum: 365 days (compliance requirement)

---

## 3. Path Storage: Calculated vs Stored

### Question
Should `minio_path` be calculated on-the-fly from workspace_id + space_id + page_id, or stored in the database?

### Decision
**Store minio_path in database** with UNIQUE constraint.

### Rationale

| Use Case | Calculate | Store | Winner |
|----------|-----------|-------|--------|
| List attachments on page | 1 row to calculate; fast | Direct lookup | Store |
| Orphan detection | Must reconstruct all paths; slow | Direct set comparison | Store |
| Page rename | No MinIO changes needed | Update path; atomic | Store |
| Query by path | Must calculate path; slow | Direct WHERE clause | Store |
| Storage size | N/A | ~500 bytes per attachment | Calculate |
| API response (GET file) | Reconstruct in application | Serve directly | Store |
| Consistency (rename) | Race condition possible | Atomic DB transaction | Store |

### Implementation

```typescript
// ✓ Good: Direct query
const attachments = await db
  .selectFrom('attachments')
  .select('*')
  .where('page_id', '=', pageId)
  .execute();

// ✗ Bad: Calculate path
const attachments = await db
  .selectFrom('attachments')
  .select('*')
  .where('page_id', '=', pageId)
  .execute()
  .map(a => ({
    ...a,
    minio_path: `${a.workspace_id}/${a.space_id}/${a.page_id}/${a.parent_page_id}/${a.filename}`
  }));
```

### UNIQUE Constraint Benefit
Prevents duplicate uploads to same location:

```sql
INSERT INTO attachments (minio_path, ...) VALUES (...)
ON CONFLICT (minio_path) DO NOTHING; -- Prevent duplicates
```

---

## 4. Attachment History Tracking

### Question
Should we track every action on attachments (upload, delete, restore, metadata changes)?

### Decision
**Yes, use `attachment_version_history` table** (optional but recommended).

### Rationale

| Feature | With History | Without | Winner |
|---------|--------------|---------|--------|
| Compliance audit trail | Full audit trail | No proof | With |
| User can see change log | "Modified 3 times" | No info | With |
| Investigate data loss | Trace delete chain | Blind | With |
| Recover previous version | Can query old etag | Can't | With |
| Disk usage | ~1KB per event | Minimal | Without |
| Query performance | Extra joins | Direct | Without |
| Debugging | Clear timeline | Guess | With |

### Decision Rationale
- Compliance alone justifies it (HIPAA, SOC 2 require audit trails)
- Storage cost negligible (1KB per event = $0.00001 per attachment)
- Query performance only matters for user-facing queries; history is admin-only

### What to Track

```typescript
type AttachmentAction =
  | 'uploaded'       // File initially uploaded
  | 'replaced'       // File replaced with new version
  | 'soft_deleted'   // User deleted (can restore)
  | 'hard_deleted'   // GC purged from MinIO
  | 'restored'       // User restored from trash
  | 'metadata_updated'; // OCR, mime-type correction, etc.
```

---

## 5. Upload Completeness Tracking

### Question
How do we detect incomplete uploads (e.g., browser crashed mid-upload)?

### Decision
**Track `uploaded_at` and `file_size` as markers of completion.**

### Rationale

```sql
-- Upload state machine:
-- Created:     file_size = NULL, uploaded_at = NULL
-- Uploading:   file_size = NULL, uploaded_at = NULL (same as created)
-- Completed:   file_size = bytes, uploaded_at = timestamp
-- Failed:      file_size = NULL, uploaded_at = NULL (can delete after 1 hour)
```

### Incomplete Upload Cleanup

```sql
-- Find uploads that crashed
SELECT id, filename, created_at
FROM attachments
WHERE uploaded_at IS NULL
  AND status = 'active'
  AND created_at < now() - INTERVAL '1 hour'
  AND workspace_id = $1;

-- These are orphans; mark for deletion
INSERT INTO attachment_orphan_markers (minio_path, ...)
SELECT minio_path, ...
FROM attachments
WHERE uploaded_at IS NULL AND created_at < now() - INTERVAL '1 hour';
```

### Why NOT Use a Separate Status Column
- Adds complexity (3 states: pending, active, soft_deleted)
- Can use NOT NULL constraints instead: file_size IS NOT NULL = uploaded
- Fewer columns to check in queries

---

## 6. Page Rename Handling

### Question
When a page is renamed/moved, how do we update attachment paths in MinIO?

### Decision
**Don't rename MinIO objects; update database paths only.**

### Rationale

| Approach | Rename MinIO | Update DB Only | Winner |
|----------|--------------|----------------|--------|
| **MinIO load** | High (N objects * 1 API call) | None | Update DB |
| **Complexity** | Atomic rename per object | Single UPDATE statement | Update DB |
| **Risk** | Partial renames if fails | Atomic; can retry | Update DB |
| **Consistency** | MinIO must be reachable | Works offline | Update DB |
| **Rollback** | Must restore all objects | Single UPDATE ROLLBACK | Update DB |

### Implementation

```typescript
async function renamePage(pageId: UUID, newTitle: string) {
  return await db.transaction().execute(async (trx) => {
    // Update page
    await trx
      .updateTable('pages')
      .set({ title: newTitle })
      .where('id', '=', pageId)
      .execute();

    // Mark attachments for reconciliation (don't rename MinIO)
    await trx
      .updateTable('attachments')
      .set({
        needs_resync: true,  // Async job will verify
        updated_at: new Date()
      })
      .where('page_id', '=', pageId)
      .execute();
  });
}
```

### Reconciliation Job Handles It

```typescript
// Hourly: verify path consistency
const attachments = await db
  .selectFrom('attachments')
  .where('needs_resync', '=', true)
  .execute();

for (const att of attachments) {
  // Verify minio_path exists in MinIO
  // If it doesn't, mark as orphan
  // If it does, clear needs_resync flag
}
```

---

## 7. Concurrent Upload Safety

### Question
How do we prevent race conditions when multiple users upload to the same page simultaneously?

### Decision
**Use distributed locking via `attachment_locks` table.**

### Rationale

| Approach | No Lock | App-Only Lock | DB Lock | Winner |
|----------|---------|---------------|---------|--------|
| **Race condition risk** | High | Medium (restart loses lock) | None | DB |
| **Horizontal scaling** | Can't scale | Lost on restart | Works across servers | DB |
| **Simplicity** | None (conflicts) | Moderate | Moderate | DB |
| **Lock cost** | High (retry loop) | Low | Low | DB |
| **Timeout handling** | App manages | App manages | DB manages | DB |

### Lock Strategy

```typescript
// Before upload
const lockId = await acquireLock(
  'attachment',
  pageId,
  sessionId,
  { expiresIn: 5 * 60 * 1000 }
);

try {
  await uploadAttachment(...);
} finally {
  await releaseLock(lockId);
}
```

### Why Lock by pageId, Not by fileName
- Multiple files to same page should be allowed
- Lock is just to serialize uploads (avoid thundering herd)
- Can improve: lock by (page_id, filename) for finer granularity

---

## 8. Garbage Collection: Daily vs Monthly Strategy

### Question
Should we delete soft-deleted attachments and old versions in one job or separate?

### Decision
**Separate jobs: daily GC (soft-delete) + monthly GC (versions).**

### Rationale

| Aspect | Combined | Separate | Winner |
|--------|----------|----------|--------|
| **Complexity** | One job | Two jobs | Combined |
| **Frequency** | Once/month | Daily + Monthly | Separate |
| **Responsiveness** | 30-day deletion delay | Deleted after 30 days | Separate |
| **Load distribution** | Spike on 1st | Consistent daily | Separate |
| **Version cleanup** | Rare; easy to miss | Dedicated job | Separate |

### Daily Job: Soft-Delete Cleanup

```typescript
// 1. Find soft-deleted > 30 days old
// 2. Delete from MinIO
// 3. Mark as hard_deleted in DB
// 4. Run hourly (small batches)
```

**Why:** Frequent execution = user gets space back quickly (psychologically important)

### Monthly Job: Version Cleanup

```typescript
// 1. Find all objects with versions
// 2. Keep current version (from minio_version_id)
// 3. Delete versions older than 3 months
// 4. Run once/month (heavier load OK)
```

**Why:** Cleanup old versions is low-priority; can batch once/month

---

## 9. Orphan Detection Strategy

### Question
How do we find MinIO objects that no longer have DB records (orphans)?

### Decision
**Weekly orphan detection job + 7-day grace period before deletion.**

### Rationale

| Approach | Immediate | Grace Period | Winner |
|----------|-----------|--------------|--------|
| **Recovery possible** | No; already deleted | Yes; 7 days to recover | Grace |
| **False positive risk** | Delete in-flight uploads | Minimal risk | Grace |
| **Runaway storage** | No waste | 7 days of waste | Immediate |
| **Complexity** | Simple | Moderate | Immediate |
| **User impact** | Lost data | Safe | Grace |

### Implementation

```typescript
// Weekly: List all MinIO objects
// For each object not in DB:
//   INSERT INTO orphan_markers (scheduled_for_deletion = now() + 7 days)
// 
// Daily: Delete orphan_markers where scheduled_for_deletion < now()
```

### Why 7 Days?
- Gives time to investigate (e.g., DB corruption)
- Matches typical cloud provider SLA response time
- Allows manual recovery if needed: `INSERT INTO attachments (...) SELECT ...`

---

## 10. Indexes: Partial vs Full

### Question
Should indexes cover all attachments or use partial indexes (WHERE status = 'active')?

### Decision
**Use partial indexes for active-only queries; full indexes for deletion queries.**

### Rationale

```sql
-- Partial index (GOOD for user queries)
-- Excludes soft-deleted, reducing size & improving cardinality
CREATE INDEX idx_attachments_page_active
ON attachments(page_id, created_at DESC)
WHERE status = 'active';

-- Full index (GOOD for GC queries)
-- Needed to find soft-deleted items
CREATE INDEX idx_attachments_soft_deleted
ON attachments(workspace_id, soft_deleted_at DESC)
WHERE status = 'soft_deleted';
```

### Trade-offs

| Concern | Partial | Full | Notes |
|---------|---------|------|-------|
| **Size** | Smaller (33% for 2:1 active:deleted) | Larger | Impacts cache |
| **Cardinality** | Better (fewer rows) | Worse | Better selectivity |
| **Active queries** | Excellent | Good | Partial wins |
| **Soft-delete queries** | Can't use | Good | Need separate |
| **Management** | More indexes | Fewer | Trade-off |

### Recommendation
- Create partial indexes for common queries (page_id, space_id, workspace_id) + active filter
- Create separate full-table indexes for GC queries (soft_deleted_at, needs_resync)
- Total: ~8-10 indexes on attachments table

---

## 11. Denormalization: parent_page_id

### Question
Should we denormalize `parent_page_id` to attachments, or always join with pages?

### Decision
**Denormalize to attachments table.**

### Rationale

| Use Case | Join | Denormalize | Winner |
|----------|------|-------------|--------|
| List page + subpage attachments | Must join | Single table scan | Denormalize |
| Parent rename/delete cascade | Must join | Direct update | Denormalize |
| Query by parent | Must join | Direct WHERE clause | Denormalize |
| Storage overhead | None | 16 bytes per attachment | Denormalize |
| Consistency | Always correct | Requires trigger | Join |

### Implementation

```typescript
// ✓ Good: Denormalized
const attachments = await db
  .selectFrom('attachments')
  .select('*')
  .where('page_id', '=', pageId)
  .orWhere('parent_page_id', '=', pageId)
  .execute();

// ✗ Bad: Join every time
const attachments = await db
  .selectFrom('attachments')
  .leftJoin('pages', 'attachments.page_id', 'pages.id')
  .select('*')
  .where('attachments.page_id', '=', pageId)
  .orWhere('pages.parent_page_id', '=', pageId)
  .execute();
```

### Keep in Sync

```typescript
async function movePageToParent(pageId: UUID, newParentId: UUID | null) {
  await db
    .updateTable('attachments')
    .set({ parent_page_id: newParentId })
    .where('page_id', '=', pageId)
    .execute();
}
```

---

## 12. Workspace Isolation

### Question
Should all attachment queries filter by workspace_id?

### Decision
**Yes, mandatory for all queries.**

### Rationale

| Aspect | Required | Optional | Winner |
|--------|----------|----------|--------|
| **Sharding potential** | Can shard by workspace | Can't shard | Required |
| **Isolation** | Guaranteed | Risk of leak | Required |
| **Performance** | Can use index | Full scan | Required |
| **Security** | Can't access other WS | Risk of breach | Required |

### Pattern

```typescript
// ALWAYS include workspace_id
await db
  .selectFrom('attachments')
  .where('workspace_id', '=', workspaceId)  // ← MANDATORY
  .where('page_id', '=', pageId)
  .execute();

// NEVER
await db
  .selectFrom('attachments')
  .where('page_id', '=', pageId)  // ← MISSING workspace filter
  .execute();
```

---

## Summary of Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Metadata storage | Store in DB | 100x faster queries; eventual consistency OK |
| Deletion | Soft + hard (dual-stage) | Safety + compliance |
| Path | Store in DB | Atomic rename; orphan detection |
| History | Track in DB | Compliance + debugging |
| Upload tracking | `file_size IS NOT NULL` | Simple; no extra state |
| Page rename | Update DB only | Atomic; offline-safe |
| Concurrency | DB locks | Works across servers |
| GC | Daily soft-delete + monthly versions | Responsive + manageable |
| Orphan grace | 7 days | Investigate window; SLA match |
| Indexes | Partial + full | Balance size & speed |
| Denormalization | parent_page_id | Avoid joins; denorm cost small |
| Workspace isolation | Required | Shardability + security |

**Overall Philosophy:** Prioritize **safety + consistency** over raw performance; use async reconciliation to bridge the gap.
