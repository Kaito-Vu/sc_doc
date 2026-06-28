# MinIO Plugin Architecture Overview

## Quick Reference

```
MinIO Attachment Plugin Architecture
=====================================

┌─────────────────────────────────────────────────────────────┐
│                      Docmost Application                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Page/Document Editor UI                │  │
│  │  (Upload, Preview, Delete Attachments)              │  │
│  └─────────────────┬──────────────────────────────────┘  │
│                    │                                      │
│                    │ HTTP REST API                        │
│                    ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Attachment API Controller                   │  │
│  │  POST   /api/v1/attachments/upload                 │  │
│  │  GET    /api/v1/attachments/{id}/download          │  │
│  │  DELETE /api/v1/attachments/{id}                   │  │
│  │  GET    /api/v1/attachments/page/{pageId}          │  │
│  └─────────────────┬──────────────────────────────────┘  │
│                    │                                      │
│                    ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      AttachmentService (Business Logic)             │  │
│  │                                                      │  │
│  │  • Validate permissions                             │  │
│  │  • Generate MinIO paths                             │  │
│  │  • Manage distributed locks                         │  │
│  │  • Track versions & history                         │  │
│  └────┬──────────────────────────┬──────────────────┬───┘  │
│       │                          │                  │      │
└───────┼──────────────────────────┼──────────────────┼──────┘
        │                          │                  │
        ▼                          ▼                  ▼
    ┌────────────┐         ┌───────────────┐  ┌──────────┐
    │ PostgreSQL │         │    MinIO      │  │ Scheduled│
    │            │         │ Object Store  │  │  Jobs    │
    │ Tables:    │         │               │  │          │
    │ • attachments                         │  │ • GC     │
    │ • versions │         │ Buckets:      │  │ • Sync   │
    │ • history  │         │ • workspace_1 │  │ • Verify │
    │ • orphans  │         │ • workspace_2 │  │ • Cleanup│
    │ • locks    │         │ • ...         │  └──────────┘
    └────────────┘         └───────────────┘
```

---

## Data Flow Diagrams

### Upload Flow (Success Path)

```
User uploads file "document.pdf" to "Home Page"
                    │
                    ▼
    ┌─────────────────────────────────┐
    │ POST /api/attachments/upload    │
    │ (with multipart form data)      │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────┐
    │ AttachmentService.upload()          │
    │                                     │
    │ 1. Validate user has workspace      │
    │    access + can edit page           │
    │ 2. Validate file: size, mime-type   │
    │ 3. Acquire distributed lock         │
    │ 4. Generate MinIO path:             │
    │    "my_workspace/slug-123_home_page │
    │     /document_<uuid>.pdf"           │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │ MinioService.putObject()        │
    │                                 │
    │ 1. Connect to MinIO             │
    │ 2. Upload file                  │
    │ 3. Get versionId, etag from MinIO
    │ 4. Return metadata              │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │ Save to PostgreSQL              │
    │                                 │
    │ • attachment record             │
    │ • version_history entry         │
    │ • Release lock                  │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │ Return to Frontend              │
    │                                 │
    │ {                               │
    │   id: "550e8400...",            │
    │   filename: "document.pdf",     │
    │   size: 1024000,                │
    │   created_at: "2026-06-28..."   │
    │ }                               │
    └─────────────────────────────────┘
```

### Delete Flow (Hard Delete)

```
User removes attachment from page
                    │
                    ▼
    ┌─────────────────────────────────┐
    │ DELETE /api/attachments/{id}    │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │ AttachmentService.delete()           │
    │                                      │
    │ 1. Check permissions (creator or     │
    │    workspace admin)                  │
    │ 2. Acquire lock on attachment       │
    │ 3. Fetch attachment record          │
    └──────────────┬─────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ MinioService.removeAllVersions() │
    │                                  │
    │ 1. List all versions of object   │
    │ 2. Delete each version           │
    │    (uses versionId)              │
    │ 3. Confirm deletion              │
    └──────────────┬────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ Update PostgreSQL                │
    │                                  │
    │ • soft_delete_at = NOW()        │
    │ • Add audit entry               │
    │ • Release lock                  │
    └──────────────┬────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ Return Success to Frontend       │
    │                                  │
    │ {                                │
    │   success: true,                 │
    │   message: "Deleted",            │
    │   versions_deleted: 3            │
    │ }                                │
    └──────────────────────────────────┘
                   │
                   ▼ (Later, by GC job)
    ┌──────────────────────────────────┐
    │ Nightly GC Job (Daily at 2 AM)   │
    │                                  │
    │ Find: soft_delete_at < NOW - 30d │
    │ For each:                        │
    │  • hard_deleted_at = NOW()      │
    │  • Remove from DB               │
    └──────────────────────────────────┘
```

### Page Rename Flow (with MinIO Sync)

```
User renames "Home Page" → "Dashboard"
Page slug changes: "home-page" → "dashboard"
                    │
                    ▼
    ┌────────────────────────────────────┐
    │ pageService.update()               │
    │ (slug changed)                     │
    └──────────────┬─────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────────┐
    │ Plugin Hook: onPageUpdate()            │
    │ (fired by core, captured by plugin)    │
    └──────────────┬─────────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────────┐
    │ AttachmentService.syncPageRename()     │
    │                                        │
    │ For each attachment on this page:      │
    │  1. Build old path:                    │
    │     "bucket/slug-123_home-page/file"   │
    │  2. Build new path:                    │
    │     "bucket/slug-123_dashboard/file"   │
    │  3. Acquire lock on attachment        │
    └──────────────┬────────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────────┐
    │ MinioService.copyObject()              │
    │                                        │
    │ 1. Copy from old path to new path     │
    │ 2. Preserve all versions              │
    │ 3. Delete old path (all versions)     │
    │ 4. Return new versionId               │
    └──────────────┬────────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────────┐
    │ Update PostgreSQL                      │
    │                                        │
    │ • minio_path = new_path               │
    │ • page_slug = "slug-123_dashboard"    │
    │ • needs_resync = true                 │
    │ • Add audit entry                     │
    │ • Release lock                        │
    └──────────────┬────────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────────┐
    │ Hourly Reconciliation Job              │
    │                                        │
    │ • Verify new path exists in MinIO     │
    │ • Verify old path doesn't exist       │
    │ • Update needs_resync = false         │
    └────────────────────────────────────────┘
```

---

## Directory Structure

```
docmost/
├── docs/
│   └── minio/
│       ├── MINIO_IMPLEMENTATION_PLAN.md      (THIS FILE)
│       ├── ARCHITECTURE_OVERVIEW.md          (Quick reference)
│       ├── CONFIGURATION_GUIDE.md            (How to configure)
│       ├── TROUBLESHOOTING.md                (Common issues)
│       ├── SCHEMA_REFERENCE.md               (DB schema details)
│       ├── API_REFERENCE.md                  (Endpoint docs)
│       └── RUNBOOKS/
│           ├── DISASTER_RECOVERY.md
│           ├── MIGRATE_EXISTING.md
│           ├── DEBUG_ORPHANED_FILES.md
│           └── RESTORE_SOFT_DELETED.md
│
├── packages/
│   ├── plugin-minio/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── hooks.ts
│   │   │   ├── services/
│   │   │   │   ├── MinioService.ts
│   │   │   │   ├── AttachmentService.ts
│   │   │   │   ├── GarbageCollector.ts
│   │   │   │   └── Reconciler.ts
│   │   │   ├── api/
│   │   │   │   ├── upload.ts
│   │   │   │   ├── download.ts
│   │   │   │   └── ...
│   │   │   ├── jobs/
│   │   │   │   ├── gcDaily.ts
│   │   │   │   ├── gcMonthly.ts
│   │   │   │   └── reconciliation.ts
│   │   │   └── migrations/
│   │   │       └── 20260630_minio_schema.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── ...
│
├── docker-compose.yml           (Updated with MinIO service)
└── .env.example                 (Updated with MinIO vars)
```

---

## Component Breakdown

### 1. MinioService
**Responsibility:** Low-level MinIO client operations

```
Methods:
  ├─ connect(config)          # Initialize MinIO client
  ├─ createBucket(name)       # Create workspace bucket
  ├─ enableVersioning(bucket) # Enable versioning
  ├─ putObject(bucket, path, buffer)
  ├─ getObject(bucket, path)
  ├─ removeObject(bucket, path, versionId?)
  ├─ removeAllVersions(bucket, path)
  ├─ copyObject(fromPath, toPath)
  ├─ listVersions(bucket, path)
  ├─ statObject(bucket, path)
  └─ health()                 # Check connection
```

### 2. AttachmentService
**Responsibility:** Business logic, permissions, transactions

```
Methods:
  ├─ upload(workspaceId, pageId, file, metadata)
  ├─ download(workspaceId, attachmentId, versionId?)
  ├─ delete(workspaceId, attachmentId)
  ├─ list(workspaceId, pageId, options)
  ├─ syncPageRename(pageId, oldSlug, newSlug)
  ├─ getVersionHistory(attachmentId)
  └─ restore(attachmentId)    # Restore soft-deleted
```

### 3. GarbageCollector
**Responsibility:** Scheduled cleanup tasks

```
Methods:
  ├─ runDailyHardDelete()     # Delete soft-deleted > 30 days
  ├─ runMonthlyVersionCleanup() # Delete versions > 90 days
  └─ markOrphaned()            # Mark for deletion
```

### 4. Reconciler
**Responsibility:** Sync MinIO state with DB

```
Methods:
  ├─ runHourlySync()          # Check MinIO ↔ DB consistency
  ├─ detectMissing()          # In DB but not in MinIO
  ├─ detectOrphaned()         # In MinIO but not in DB
  └─ repair()                 # Fix inconsistencies
```

---

## State Machines

### Attachment Lifecycle

```
┌─────────────┐
│   CREATED   │ (user uploads)
│             │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   ACTIVE    │ (available for download)
│             │ ┌─ can be soft-deleted
│             │ └─ can be renamed
└──────┬──────┘
       │
       │ (user removes from page)
       ▼
┌─────────────────┐
│  SOFT_DELETED   │ (grace period: 30 days)
│                 │ ┌─ can be restored during grace
│                 │ └─ occupies storage space
└──────┬──────────┘
       │
       │ (grace period expires, GC runs)
       ▼
┌─────────────────┐
│  HARD_DELETED   │ (permanent)
│                 │
│ (removed from   │
│  MinIO + DB)    │
└─────────────────┘
```

### Job Execution Timeline

```
Time     Event
────────────────────────────────────────────────────────
Every 5m Lock Cleanup      (remove stale locks)
         │
Hourly   Reconciliation    (MinIO ↔ DB sync)
         │ ├─ List MinIO objects
         │ ├─ Compare with DB
         │ └─ Mark orphaned
         │
Daily    Garbage Collection (hard delete soft-deleted)
(2 AM)   │ Find soft_deleted_at < NOW - 30 days
         │ Delete from MinIO
         │ Delete from DB
         │
Monthly  Version Cleanup   (delete old versions)
(1st, 3AM)│ Find versions > 90 days old
         │ Delete from MinIO
         │
```

---

## Database State Diagram

### Attachment States

```
                ┌─────────────────────┐
                │  soft_delete_at IS NULL
                │  hard_deleted_at IS NULL
                │                     │
                │      ACTIVE         │
                │  (available)        │
                └────────┬────────────┘
                         │
                         │ User deletes
                         ▼
                ┌─────────────────────┐
                │ soft_delete_at = NOW│
                │ hard_deleted_at IS NULL
                │                     │
                │  SOFT_DELETED       │
                │  (recoverable for   │
                │   30 days)          │
                └────────┬────────────┘
                         │
                         │ GC job after 30 days
                         ▼
                ┌─────────────────────┐
                │ soft_delete_at = ... │
                │ hard_deleted_at = NOW
                │                     │
                │  HARD_DELETED       │
                │  (permanent)        │
                └─────────────────────┘
```

---

## Error Handling Strategy

```
┌─ Network Error
│  ├─ MinIO unreachable
│  │  └─ Store as PENDING, retry with backoff
│  │
│  └─ Database unavailable
│     └─ Fail fast, return 503 Service Unavailable
│
├─ File Error
│  ├─ Invalid file type
│  │  └─ Reject in validation, return 400
│  │
│  ├─ File too large
│  │  └─ Check quota first, return 507
│  │
│  └─ Upload interrupted
│     └─ Rollback to DB, GC will clean orphan
│
├─ Concurrency Error
│  ├─ Attachment locked (being modified)
│  │  └─ Retry with exponential backoff
│  │
│  └─ Race condition (delete while downloading)
│     └─ Return 410 Gone
│
└─ Data Consistency Error
   ├─ In DB but not in MinIO
   │  └─ Mark needs_resync, retry upload
   │
   └─ In MinIO but not in DB
      └─ Mark as orphaned (GC will remove)
```

---

## Performance Characteristics

### Latency (p99)

| Operation | Latency | Notes |
|-----------|---------|-------|
| Upload (10 MB) | 500ms | Network + MinIO write |
| Download (10 MB) | 400ms | MinIO read + network |
| Delete | 100ms | DB update + MinIO delete |
| List attachments | 50ms | DB query (indexed) |
| Page rename (10 attachments) | 2s | Sequential MinIO copies |

### Storage Efficiency

| Scenario | Size | Notes |
|----------|------|-------|
| Single file, 1 version | 10 MB | Binary in MinIO |
| Single file, 3 versions | 30 MB | All versions in MinIO |
| Soft-deleted (30-day grace) | 10 MB | Still in MinIO, marked in DB |
| After hard-delete | 0 MB | Completely removed |

### Scalability Limits

- **Max files per page:** 1000 (soft limit, UI may paginate)
- **Max file size:** Configurable (default 100 MB)
- **Max workspace storage:** Configurable (depends on MinIO disk)
- **Concurrent uploads:** Unlimited (distributed locks prevent conflicts)
- **Background job frequency:** 5 min (locks) → 1 hour (sync) → daily (GC)

---

## Next Steps

1. **Review** this architecture with team
2. **Discuss** any concerns or alternative approaches
3. **Proceed** to CONFIGURATION_GUIDE.md for setup instructions
4. **Begin** Phase 1 implementation (see MINIO_IMPLEMENTATION_PLAN.md)

