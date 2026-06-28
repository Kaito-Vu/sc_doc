# MinIO Plugin - Quick Start Checklist

## Pre-Implementation Setup

### Environment Setup
- [ ] Node.js 18+ installed
- [ ] Docker & Docker Compose installed
- [ ] PostgreSQL 14+ running
- [ ] MinIO understanding (object storage basics)
- [ ] Git access to project repository

### Development Tools
- [ ] IDE with TypeScript support (VS Code, WebStorm, etc.)
- [ ] PostgreSQL client (psql, DBeaver, pgAdmin)
- [ ] MinIO client (minio cli, mc command)
- [ ] Postman/Insomnia for API testing
- [ ] Bull Board for job monitoring (optional)

---

## Phase 1: Core Infrastructure (Weeks 1-2)

### Step 1.1: Database Setup
```bash
# Create migration file
npx kysely migration:create minio_attachment_schema

# Edit migration (see MINIO_IMPLEMENTATION_PLAN.md section "Database Schema")

# Run migration
npx kysely migrate:latest
```

**Verify:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'attachment%';
```

**Expected tables:**
- [ ] attachments
- [ ] attachment_version_history
- [ ] attachment_locks
- [ ] attachment_orphan_markers
- [ ] workspace_minio_settings

### Step 1.2: Docker Compose Setup
```bash
# Update docker-compose.yml (see MINIO_IMPLEMENTATION_PLAN.md section "Docker Setup")
# Add MinIO service

# Start MinIO
docker-compose up -d minio

# Verify MinIO running
curl http://localhost:9000/minio/health/live
# Expected: 200 OK
```

**MinIO Console:**
- URL: http://localhost:9001
- Username: minioadmin
- Password: minioadmin

### Step 1.3: Create Plugin Structure
```bash
# Create plugin package
mkdir -p packages/plugin-minio/src/{services,api,middleware,jobs,migrations,utils}
mkdir -p packages/plugin-minio/{tests,docs}

# Create TypeScript files
touch packages/plugin-minio/src/index.ts
touch packages/plugin-minio/src/config.ts
touch packages/plugin-minio/src/hooks.ts
touch packages/plugin-minio/src/types.ts

# Create services
touch packages/plugin-minio/src/services/{MinioService,AttachmentService,GarbageCollector,Reconciler}.ts

# Create API routes
touch packages/plugin-minio/src/api/{upload,download,delete,list,settings}.ts

# Setup tests
mkdir -p packages/plugin-minio/tests/{unit,integration}
```

### Step 1.4: Implement MinioService
**File:** `packages/plugin-minio/src/services/MinioService.ts`

```typescript
// Key methods to implement:
// - connect(config)
// - createBucket(name)
// - enableVersioning(bucket)
// - putObject(bucket, path, buffer)
// - getObject(bucket, path, versionId?)
// - removeObject(bucket, path, versionId?)
// - health()

// See MINIO_IMPLEMENTATION_PLAN.md for full implementation
```

**Test:**
```bash
npm test -- packages/plugin-minio/src/services/MinioService.test.ts
```

### Step 1.5: Implement AttachmentService
**File:** `packages/plugin-minio/src/services/AttachmentService.ts`

```typescript
// Key methods:
// - upload(workspaceId, pageId, file, metadata)
// - download(workspaceId, attachmentId, versionId?)
// - delete(workspaceId, attachmentId)
// - list(workspaceId, pageId, options)

// Include:
// - Permission checks
// - Path generation
// - Database transaction
// - Lock acquisition/release
```

### Step 1.6: Create API Endpoints
**File:** `packages/plugin-minio/src/api/routes.ts`

```typescript
// Create Express routes:
// POST   /api/v1/attachments/upload
// GET    /api/v1/attachments/{id}/download
// DELETE /api/v1/attachments/{id}
// GET    /api/v1/attachments/page/{pageId}
// GET    /api/v1/workspace/{workspaceId}/minio-settings
// PUT    /api/v1/workspace/{workspaceId}/minio-settings
```

**Test with Postman:**
- [ ] Upload test file
- [ ] Verify in MinIO console (should appear at: my_workspace/slug-xxx/filename_uuid.ext)
- [ ] Download file
- [ ] Verify file content matches
- [ ] Delete file
- [ ] Verify in MinIO (should be marked deleted with version)

### Step 1.7: Workspace Settings UI
**File:** Need UI component for workspace settings

- [ ] Form to enter MinIO endpoint, credentials
- [ ] Test connection button
- [ ] Display bucket name (auto-generated)
- [ ] Display storage usage
- [ ] Display health status

**Acceptance Criteria:**
- [ ] Settings saved to DB
- [ ] MinIO bucket created automatically
- [ ] Versioning enabled on bucket
- [ ] Storage quota displayed

---

## Phase 2: Deletion & Lifecycle (Weeks 3-4)

### Step 2.1: Soft Delete Implementation
**File:** `packages/plugin-minio/src/services/AttachmentService.ts` (extend)

```typescript
async delete(workspaceId, attachmentId) {
  // 1. Fetch attachment
  // 2. Check permissions
  // 3. Delete all versions from MinIO
  // 4. Set soft_delete_at in DB
  // 5. Create audit trail entry
  // 6. Return success
}
```

**Test:**
```bash
# Delete attachment from page
# Verify soft_delete_at is set
SELECT id, soft_delete_at FROM attachments WHERE id = '<id>';

# Verify in MinIO (object should be marked deleted but still exist)
mc ls --recursive minio/my_workspace
```

### Step 2.2: Distributed Locking
**File:** `packages/plugin-minio/src/middleware/attachmentLocking.ts`

```typescript
// Implement distributed lock for concurrent safety:
// - Acquire lock before modify
// - Release after operation
// - Timeout: 30 seconds
// - Retry with backoff

// Use PostgreSQL for lock storage (attachment_locks table)
```

**Test:**
```bash
# Simulate concurrent uploads to same page
# Verify only one succeeds at a time
```

### Step 2.3: Page Rename Sync
**File:** `packages/plugin-minio/src/hooks.ts`

```typescript
// Implement hook: onPageUpdate()
// Called when page is renamed/moved

// For each attachment on page:
// 1. Copy object in MinIO from old path to new path
// 2. Update minio_path in DB
// 3. Update page_slug in DB
// 4. Set needs_resync = true
// 5. Delete old path
```

**Test:**
```bash
# Rename page in UI
# Verify attachments still accessible
# Verify MinIO paths updated
```

### Step 2.4: Attachment History
**Create:** `attachment_version_history` tracking

```typescript
// On every action (create, update, delete, rename):
// 1. Snapshot old values
// 2. Snapshot new values
// 3. Record actor (user ID)
// 4. Store in attachment_version_history table
```

**Test:**
```sql
SELECT * FROM attachment_version_history 
WHERE attachment_id = '<id>' 
ORDER BY created_at DESC;
```

---

## Phase 3: Background Jobs (Weeks 5-6)

### Step 3.1: Setup Job Scheduler
**Install:** Bull or Bull MQ for job queuing

```bash
npm install bull redis
# or
npm install bullmq redis
```

**File:** `packages/plugin-minio/src/jobs/scheduler.ts`

```typescript
// Create job queues:
// - gcDaily
// - gcMonthly
// - reconcile
// - lockCleanup

// Setup recurring schedules (using cron expressions)
```

### Step 3.2: Implement Daily GC Job
**File:** `packages/plugin-minio/src/jobs/gcDaily.ts`

```typescript
// Run: Daily at 2:00 AM
// Action: Hard delete attachments soft-deleted > 30 days

// Algorithm:
// 1. For each workspace:
//    a. Find attachments: soft_delete_at < NOW - 30 days
//    b. For each: delete from MinIO + DB
//    c. Log results
```

**Test:**
```bash
# Manually trigger job
npm run job:gc-daily

# Verify logs show correct count deleted
```

### Step 3.3: Implement Monthly Version Cleanup
**File:** `packages/plugin-minio/src/jobs/gcMonthly.ts`

```typescript
// Run: Monthly (1st at 3:00 AM)
// Action: Delete versions > 90 days old

// Algorithm:
// 1. For each workspace:
//    a. Get gc_version_retention_days from settings
//    b. List all objects in bucket
//    c. For each object: list versions
//    d. Delete versions older than retention
```

**Test:**
```bash
# Create test file, upload multiple times
# Wait (or use test data from past)
# Run monthly GC
# Verify old versions deleted but file still exists
```

### Step 3.4: Implement Hourly Reconciliation
**File:** `packages/plugin-minio/src/jobs/reconciliation.ts`

```typescript
// Run: Every hour
// Action: Sync MinIO state with DB

// Algorithm:
// 1. For each workspace:
//    a. List all objects in MinIO
//    b. Get all attachments from DB
//    c. Find differences:
//       - In MinIO but not DB → mark orphaned
//       - In DB but not MinIO → mark needs_resync
//    d. Log inconsistencies
```

**Test:**
```bash
# Manually delete object from MinIO (via console)
# Run reconciliation
# Verify orphan marked in DB
```

### Step 3.5: Job Monitoring
- [ ] Setup Bull Board UI (optional)
- [ ] Log all job executions (job_logs table)
- [ ] Alert on job failures (email/Slack)
- [ ] Track job duration & success rate

**Monitor:**
```bash
# View Bull Board
curl http://localhost:3000/bull-board

# Check logs
SELECT * FROM job_logs WHERE created_at > NOW() - INTERVAL '24 hours'
```

---

## Phase 4: Versioning & Recovery (Weeks 7-8)

### Step 4.1: Enable MinIO Versioning
```bash
# Verify versioning enabled on bucket
mc version info minio/my_workspace

# Expected: Versioning enabled
```

### Step 4.2: Track VersionId
**File:** `packages/plugin-minio/src/services/AttachmentService.ts` (extend)

```typescript
// When uploading, capture MinIO versionId:
const uploadResult = await minioClient.putObject(...)
await db.attachments.update({
  data: {
    minio_version_id: uploadResult.versionId,
    minio_etag: uploadResult.etag
  }
})
```

### Step 4.3: Version Download
**File:** `packages/plugin-minio/src/api/download.ts` (extend)

```typescript
// Add query parameter: ?version=<versionId>
// Allow downloading specific version
```

**Test:**
```bash
# Upload file (v1)
# Modify & upload again (v2)
# Download v1 by versionId
# Verify content matches first version
```

### Step 4.4: Orphan Markers & Grace Period
**Table:** `attachment_orphan_markers`

```typescript
// When orphaned object detected:
// 1. Add to orphan_markers table
// 2. Set hard_delete_after = NOW + 7 days
// 3. Monitor table
// 4. After 7 days, hard delete
```

**Test:**
```sql
-- View orphaned objects
SELECT * FROM attachment_orphan_markers 
WHERE hard_delete_after < NOW();
```

---

## Phase 5: Testing & Deployment (Weeks 9-10)

### Step 5.1: Unit Tests
```bash
npm test -- packages/plugin-minio/tests/unit

# Verify all pass:
# - MinioService tests
# - Path generation tests
# - Permission checks
```

### Step 5.2: Integration Tests
```bash
npm test -- packages/plugin-minio/tests/integration

# Test flows:
# - Upload → Download → Delete → Recover
# - Concurrent uploads
# - Page rename
# - MinIO unavailable (retry logic)
```

### Step 5.3: Load Testing
```bash
# Test 100 concurrent uploads
ab -n 100 -c 10 http://localhost:3000/api/v1/attachments/upload

# Test 1000 downloads
locust -f tests/load/download.py
```

### Step 5.4: Disaster Recovery Testing
- [ ] Backup/restore MinIO data
- [ ] Recover orphaned files
- [ ] Restore soft-deleted files
- [ ] Handle MinIO downtime
- [ ] Migrate existing attachments (if applicable)

### Step 5.5: Production Checklist

**Before Deployment:**
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Database migrated in staging
- [ ] MinIO configured & healthy
- [ ] Disaster recovery plan documented
- [ ] Monitoring & alerting configured
- [ ] Admin trained on settings UI
- [ ] Rollback plan ready

**Deployment Steps:**
1. Schedule downtime (if needed)
2. Backup database
3. Run migrations: `npm run migrate:latest`
4. Deploy code
5. Start background jobs: `npm run start:jobs`
6. Verify: upload/download/delete test attachment
7. Monitor logs for 24 hours

**Post-Deployment:**
- [ ] Monitor MinIO health
- [ ] Check job execution logs
- [ ] Monitor error rates
- [ ] Verify storage usage accurate
- [ ] Collect user feedback

---

## Common Commands

### MinIO CLI
```bash
# Set alias
mc alias set minio http://localhost:9000 minioadmin minioadmin

# List buckets
mc ls minio/

# List contents
mc ls --recursive minio/my_workspace/

# Upload test file
mc cp test.pdf minio/my_workspace/test.pdf

# Remove file
mc rm minio/my_workspace/test.pdf

# View object info
mc stat minio/my_workspace/test.pdf

# List versions
mc version list minio/my_workspace/test.pdf
```

### Database Queries
```sql
-- Find all attachments in workspace
SELECT id, filename, file_size, created_at 
FROM attachments 
WHERE workspace_id = '<workspace_id>' 
AND soft_delete_at IS NULL
ORDER BY created_at DESC;

-- Find soft-deleted
SELECT id, filename, soft_delete_at 
FROM attachments 
WHERE workspace_id = '<workspace_id>' 
AND soft_delete_at IS NOT NULL
AND hard_deleted_at IS NULL;

-- Find attachments needing sync
SELECT id, filename, minio_path, error_message 
FROM attachments 
WHERE needs_resync = true;

-- View audit trail
SELECT action, actor_id, created_at 
FROM attachment_version_history 
WHERE attachment_id = '<id>'
ORDER BY created_at DESC;

-- Find orphaned markers
SELECT minio_path, reason, marked_at, hard_delete_after 
FROM attachment_orphan_markers 
ORDER BY hard_delete_after ASC;
```

### Job Management
```bash
# Run specific job manually
npm run job:gc-daily
npm run job:gc-monthly
npm run job:reconcile
npm run job:cleanup-locks

# View job queue status
npm run job:status

# Clear job queue (CAREFUL)
npm run job:clear --queue=gc-daily
```

---

## Troubleshooting Quick Links

**Problem:** Upload fails with 503
- [ ] Check MinIO is running: `docker ps | grep minio`
- [ ] Check MinIO health: `curl http://localhost:9000/minio/health/live`
- [ ] Check logs: `docker logs docmost-minio`

**Problem:** Files appear in DB but not MinIO
- [ ] Check needs_resync flag: `SELECT * FROM attachments WHERE needs_resync = true;`
- [ ] Run reconciliation: `npm run job:reconcile`
- [ ] Check error_message field

**Problem:** Attachments still exist after delete
- [ ] Check soft_delete_at: `SELECT soft_delete_at FROM attachments WHERE id = '<id>';`
- [ ] Wait for daily GC job (runs 2 AM) or run manually
- [ ] Check hard_deleted_at after GC

**Problem:** Page rename broke attachment links
- [ ] Check minio_path: `SELECT minio_path FROM attachments WHERE page_id = '<page_id>';`
- [ ] Verify in MinIO: `mc ls minio/my_workspace/`
- [ ] Check needs_resync and run reconciliation if true

**Problem:** Job not running
- [ ] Check Redis connection: `redis-cli ping`
- [ ] Check job queue: `npm run job:status`
- [ ] Check job logs: `SELECT * FROM job_logs WHERE created_at > NOW() - INTERVAL '1 hour';`
- [ ] Restart job service

---

## Reference Links

- [MINIO_IMPLEMENTATION_PLAN.md](./MINIO_IMPLEMENTATION_PLAN.md) - Full implementation guide
- [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - System design & data flows
- [CONFIGURATION_GUIDE.md](./CONFIGURATION_GUIDE.md) - How to configure MinIO
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues & solutions
- [RUNBOOKS/](./RUNBOOKS/) - Operational procedures

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Upload file to page → appears in MinIO
- ✅ Download file → content matches original
- ✅ Delete file → soft-deleted in DB, marked in MinIO
- ✅ Workspace settings configured → bucket created

### Phase 2 Complete When:
- ✅ Rename page → attachments follow and remain accessible
- ✅ Concurrent uploads → handled safely with locks
- ✅ Soft-deleted files → recoverable during 30-day grace

### Phase 3 Complete When:
- ✅ Daily GC job → runs at 2 AM, removes old soft-deleted
- ✅ Reconciliation → runs hourly, detects inconsistencies
- ✅ Monthly cleanup → removes versions > 90 days

### Phase 4 Complete When:
- ✅ Multiple versions → tracked and downloadable
- ✅ Orphan detection → grace period enforced

### Phase 5 Complete When:
- ✅ All tests passing
- ✅ Production deployment successful
- ✅ No data loss or inconsistencies observed

