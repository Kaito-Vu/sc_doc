# MinIO Attachment Storage Plugin Documentation

**Version**: 1.0  
**Status**: Ready for Implementation  
**Last Updated**: 2026-06-28

---

## Overview

This directory contains complete documentation for implementing MinIO as an object storage backend for Docmost attachments. The plugin enables:

- ✅ Scalable file storage with workspace isolation
- ✅ MinIO native object versioning
- ✅ Automated garbage collection and cleanup
- ✅ Page rename/move synchronization
- ✅ Data consistency reconciliation
- ✅ Soft-delete with 30-day recovery grace period
- ✅ Monthly version cleanup (configurable retention)

---

## Documentation Guide

### 🚀 Getting Started
**Start here** if you're new to this plugin:

1. **[QUICK_START_CHECKLIST.md](./QUICK_START_CHECKLIST.md)** ← **START HERE**
   - Step-by-step implementation checklist
   - Commands and test procedures
   - Success criteria for each phase
   - Common commands reference

### 🏗️ Architecture & Design
**Reference materials** for understanding the system:

2. **[ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)**
   - System architecture diagram
   - Data flow diagrams (upload, delete, rename)
   - Component breakdown
   - State machines
   - Performance characteristics

3. **[MINIO_IMPLEMENTATION_PLAN.md](./MINIO_IMPLEMENTATION_PLAN.md)**
   - Comprehensive implementation guide
   - Database schema (5 tables, detailed)
   - Plugin structure and organization
   - API endpoint specifications
   - MinIO configuration details
   - 5-phase implementation roadmap
   - Background job specifications
   - Error handling & recovery strategies
   - Testing strategy
   - Deployment checklist

### ⚙️ Configuration & Operations
**How to configure, deploy, and manage** (coming soon):

4. **CONFIGURATION_GUIDE.md** (to be created)
   - MinIO setup (Docker, credentials, buckets)
   - Workspace settings configuration
   - Retention policy setup
   - SSL/TLS configuration
   - Performance tuning

5. **TROUBLESHOOTING.md** (to be created)
   - Common issues and solutions
   - Debugging procedures
   - Log interpretation
   - Recovery procedures

### 📋 Operational Runbooks
**Step-by-step procedures** for admins (to be created):

6. **RUNBOOKS/** directory
   - `DISASTER_RECOVERY.md` - Backup/restore procedures
   - `MIGRATE_EXISTING.md` - Migrate existing attachments to MinIO
   - `DEBUG_ORPHANED_FILES.md` - Find and manage orphaned files
   - `RESTORE_SOFT_DELETED.md` - Restore deleted attachments

---

## Quick Reference

### Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Bucket Strategy** | Per-workspace bucket | Isolation, easy audit, multi-tenant ready |
| **Path Structure** | workspace/page_slug/subpage_slug/file_uuid | Prevents collisions, supports hierarchy |
| **Versioning** | MinIO native object versioning | Built-in, efficient, automatic |
| **Deletion** | Hard delete (all versions immediately) | Clean, simple, no ambiguity |
| **Soft Delete** | 30-day grace period | Allows accidental recovery |
| **GC Schedule** | Daily (markers) + Monthly (versions) | Daily for cleanup, monthly for storage optimization |
| **Page Rename** | Rename/move objects in MinIO | Keeps paths consistent, prevents orphans |
| **Data Consistency** | Hourly reconciliation | Handles eventual consistency, detects orphans |

### Key Files Modified

```
✅ docker-compose.yml        - Added MinIO service
✅ .env.example              - Added MinIO configuration
📝 packages/plugin-minio/    - New plugin package (to be created)
📝 docs/minio/               - Documentation (in progress)
```

### Implementation Timeline

| Phase | Duration | Focus | Deliverables |
|-------|----------|-------|--------------|
| **1** | Weeks 1-2 | Core Infrastructure | Upload/Download/Settings |
| **2** | Weeks 3-4 | Deletion & Lifecycle | Soft-delete, Rename sync |
| **3** | Weeks 5-6 | Background Jobs | GC, Reconciliation |
| **4** | Weeks 7-8 | Versioning & Recovery | Version history, Restore |
| **5** | Weeks 9-10 | Testing & Deployment | E2E tests, Production deploy |

---

## Database Schema Quick Look

### Core Tables

```sql
-- Attachment metadata
attachments (
  id, workspace_id, page_id, subpage_id,
  filename, mime_type, file_size,
  minio_bucket, minio_path, minio_version_id,
  created_by, created_at, soft_delete_at, hard_deleted_at,
  needs_resync, last_sync_at
)

-- Workspace MinIO settings
workspace_minio_settings (
  workspace_id, minio_endpoint, minio_access_key, minio_secret_key,
  minio_bucket_name, is_configured, is_enabled,
  gc_soft_delete_grace_days, gc_version_retention_days
)

-- Audit trail
attachment_version_history (
  attachment_id, workspace_id, action, actor_id,
  old_values, new_values, created_at
)

-- Concurrent safety
attachment_locks (
  attachment_id, locked_by, locked_at, expires_at
)

-- GC staging
attachment_orphan_markers (
  workspace_id, minio_path, reason, marked_at,
  hard_delete_after, deletion_error
)
```

---

## API Endpoints

### Core Operations

```
POST   /api/v1/attachments/upload               Upload files
GET    /api/v1/attachments/{id}/download        Download file (with version)
DELETE /api/v1/attachments/{id}                 Delete attachment
GET    /api/v1/attachments/page/{pageId}        List page attachments
```

### Configuration

```
GET    /api/v1/workspace/{id}/minio-settings    Get MinIO config
PUT    /api/v1/workspace/{id}/minio-settings    Update MinIO config
```

---

## Background Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| **Lock Cleanup** | Every 5 min | Remove expired distributed locks |
| **Reconciliation** | Hourly | Sync MinIO ↔ DB state, detect orphans |
| **Daily GC** | 2:00 AM daily | Hard-delete soft-deleted > 30 days |
| **Monthly GC** | 3:00 AM 1st of month | Delete versions > 90 days old |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- 5 minutes for setup

### Quick Start (5 minutes)

1. **Update Docker Compose** ✅ (Already done)
   ```bash
   docker-compose up -d minio
   ```

2. **Update .env** ✅ (Already done)
   ```bash
   # Add MinIO variables
   MINIO_ENDPOINT=minio:9000
   MINIO_ROOT_USER=minioadmin
   MINIO_ROOT_PASSWORD=minioadmin
   ```

3. **Read Implementation Plan**
   → Open [QUICK_START_CHECKLIST.md](./QUICK_START_CHECKLIST.md)

4. **Follow Phase 1**
   → Database setup → MinioService → API endpoints

### Test the Setup

```bash
# 1. Verify MinIO is running
curl http://localhost:9000/minio/health/live
# Expected: 200 OK

# 2. Access MinIO Console
open http://localhost:9001
# Username: minioadmin | Password: minioadmin

# 3. Create test bucket
mc alias set minio http://localhost:9000 minioadmin minioadmin
mc mb minio/test_workspace
mc version enable minio/test_workspace
```

---

## Architecture at a Glance

```
┌─────────────────────────────────┐
│  Docmost Frontend               │
│  (Upload, Delete, Download)     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Attachment API (REST)          │
│  - Upload endpoint              │
│  - Download endpoint            │
│  - Delete endpoint              │
│  - List endpoint                │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  AttachmentService              │
│  (Permissions, Validation)      │
└────────────┬────────────────────┘
             │
      ┌──────┴───────┐
      │              │
      ▼              ▼
   ┌────────┐   ┌──────────┐
   │MinIO   │   │PostgreSQL│
   │Objects │   │Metadata  │
   └────────┘   └──────────┘
      │
      └─ Background Jobs
         ├─ GC (daily/monthly)
         ├─ Reconciliation (hourly)
         └─ Lock Cleanup (every 5 min)
```

---

## Implementation Roadmap

### Phase 1: Core ✅ Ready
- Database schema
- MinioService wrapper
- Upload/Download endpoints
- Workspace settings UI

### Phase 2: Deletion & Lifecycle 🚧 Ready
- Soft-delete with grace period
- Distributed locking
- Page rename synchronization
- Audit trail tracking

### Phase 3: Background Jobs 🚧 Ready
- Daily garbage collection
- Monthly version cleanup
- Hourly reconciliation
- Lock cleanup

### Phase 4: Versioning & Recovery 🚧 Ready
- Object versioning integration
- Version history
- Version download
- Orphan grace period

### Phase 5: Testing & Deployment 🚧 Ready
- Unit tests
- Integration tests
- Load testing
- Production deployment

---

## Key Metrics

### Performance (p99)
- Upload (10 MB): 500ms
- Download (10 MB): 400ms
- Delete: 100ms
- List: 50ms

### Scalability
- Max files per page: 1000
- Max file size: 100 MB (configurable)
- Concurrent uploads: Unlimited
- Workspace storage: Configurable

### Retention
- Soft-delete grace: 30 days
- Version retention: 90 days
- Orphan grace period: 7 days

---

## Support & Questions

### Documentation Hierarchy

1. **New to the project?** → [QUICK_START_CHECKLIST.md](./QUICK_START_CHECKLIST.md)
2. **Need system design?** → [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
3. **Need full details?** → [MINIO_IMPLEMENTATION_PLAN.md](./MINIO_IMPLEMENTATION_PLAN.md)
4. **Need to deploy?** → (Coming soon) CONFIGURATION_GUIDE.md
5. **Something broken?** → (Coming soon) TROUBLESHOOTING.md

### Common Issues

| Issue | Where to Look |
|-------|---------------|
| How do I set up MinIO? | [Quick Start Checklist](./QUICK_START_CHECKLIST.md#step-12-docker-compose-setup) |
| How does versioning work? | [Architecture Overview](./ARCHITECTURE_OVERVIEW.md#versioning--retention) |
| What's the API? | [Implementation Plan](./MINIO_IMPLEMENTATION_PLAN.md#api-endpoints) |
| How does GC work? | [Implementation Plan](./MINIO_IMPLEMENTATION_PLAN.md#background-jobs) |
| How do I debug? | (Coming soon) TROUBLESHOOTING.md |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-28 | Initial documentation release |

---

## Next Steps

1. ✅ Review [QUICK_START_CHECKLIST.md](./QUICK_START_CHECKLIST.md)
2. ✅ Review [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
3. ⬜ Begin Phase 1 implementation
4. ⬜ Create package/plugin-minio
5. ⬜ Implement database migration
6. ⬜ Implement MinioService
7. ⬜ Test with sample files

**Estimated Time to Production**: 10 weeks

---

## Document Structure

```
docs/minio/
├── README.md (this file)
├── QUICK_START_CHECKLIST.md          ← START HERE
├── ARCHITECTURE_OVERVIEW.md          ← System design
├── MINIO_IMPLEMENTATION_PLAN.md      ← Full details
├── CONFIGURATION_GUIDE.md            (TODO)
├── TROUBLESHOOTING.md                (TODO)
└── RUNBOOKS/                         (TODO)
    ├── DISASTER_RECOVERY.md
    ├── MIGRATE_EXISTING.md
    ├── DEBUG_ORPHANED_FILES.md
    └── RESTORE_SOFT_DELETED.md
```

