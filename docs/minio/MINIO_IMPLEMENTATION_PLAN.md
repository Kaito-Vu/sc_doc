# MinIO Attachment Storage Plugin - Implementation Plan

**Version**: 1.0  
**Status**: Ready for Implementation  
**Created**: 2026-06-28  
**Owner**: Docmost Core Team

---

## Executive Summary

This document provides a comprehensive implementation plan for the MinIO attachment storage plugin for Docmost. The plugin enables scalable, versioned file storage for all attachments (images, documents, etc.) across workspaces, with automated lifecycle management and garbage collection.

### Key Design Decisions

| Aspect | Decision |
|--------|----------|
| Storage Backend | MinIO (S3-compatible) |
| Versioning | MinIO native object versioning (enabled per bucket) |
| Bucket Strategy | Per-workspace bucket (isolated, easy audit) |
| Path Structure | Normalized workspace name + hierarchical page structure |
| File Naming | `filename_uuid.ext` (prevents collisions) |
| Deletion Strategy | Hard delete (all versions immediately removed) |
| Garbage Collection | Daily (delete markers) + Monthly (old versions > 3 months) |
| Page Rename | Sync rename/move on MinIO (no orphaned objects) |
| Data Consistency | Eventual consistency with hourly reconciliation |

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Plugin Structure](#plugin-structure)
4. [API Endpoints](#api-endpoints)
5. [MinIO Configuration](#minio-configuration)
6. [Docker Setup](#docker-setup)
7. [Implementation Phases](#implementation-phases)
8. [Background Jobs](#background-jobs)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Migration Strategy](#migration-strategy)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Checklist](#deployment-checklist)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Docmost Core                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌──────────────┐             │
│  │  Page UI     │────────▶│ Attachment   │             │
│  │ (Frontend)   │         │   Manager    │             │
│  └──────────────┘         │   (Plugin)   │             │
│                           └──────┬───────┘             │
│                                  │                     │
│                    ┌─────────────┼──────────────┐      │
│                    │             │              │      │
│                    ▼             ▼              ▼      │
│              ┌─────────┐   ┌─────────┐   ┌──────────┐  │
│              │PostgreSQL    │ Cache   │   │  Hooks   │  │
│              └─────────┘   └─────────┘   └──────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
                           │ (S3 API)
                           ▼
                    ┌──────────────┐
                    │    MinIO     │
                    │  Object Store│
                    └──────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
                    ▼              ▼
            ┌───────────────┐ ┌──────────┐
            │  Workspace    │ │  Versions│
            │   Buckets     │ │(Deleted) │
            └───────────────┘ └──────────┘


Background Jobs (Scheduled):
├─ Hourly:  Reconciliation (MinIO ↔ DB sync)
├─ Daily:   Garbage Collection (delete markers)
├─ Monthly: Version Cleanup (> 3 months old)
└─ Every 5min: Lock Cleanup (stale distributed locks)
```

### Data Flow

#### Upload Flow
```
1. User selects file on page
   │
2. Frontend calls POST /api/attachments/upload
   │
3. Plugin validates: workspace, page, permissions
   │
4. Generate: minio_path = workspace_bucket/page_path/subpage_path/filename_uuid.ext
   │
5. Upload to MinIO (with generated_uuid in metadata)
   │
6. MinIO returns versionId, etag, last_modified
   │
7. Store metadata in DB (PostgreSQL)
   │
8. Return attachment metadata to frontend
   │
9. Frontend updates page with attachment reference
```

#### Delete Flow
```
1. User removes attachment from page
   │
2. Frontend calls DELETE /api/attachments/{attachmentId}
   │
3. Plugin checks permissions
   │
4. Delete ALL versions from MinIO (using versionId)
   │
5. Mark attachment as deleted in DB (soft_delete_at timestamp)
   │
6. Return success to frontend
   │
7. Async: GC job runs daily/monthly
   │
8. Soft-deleted > 30 days → Hard-delete from DB
```

#### Page Rename Flow
```
1. User renames page "My Docs" → "My Documents"
   │
2. Page slug changes: "my-docs" → "my-documents"
   │
3. Plugin hook: onPageUpdate()
   │
4. For each attachment on page:
   ├─ Build new MinIO path (with new slug)
   ├─ Copy/Move object in MinIO (atomic operation)
   ├─ Update DB: minio_path, slug
   └─ Mark: needs_resync = true (for reconciliation)
   │
5. Frontend reflects renamed attachment paths
```

---

## Database Schema

### Tables

#### 1. `attachments` (Enhanced)

Stores metadata for all attachments with versioning support.

```sql
CREATE TABLE attachments (
  -- Identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  subpage_id UUID NULLABLE REFERENCES subpages(id) ON DELETE SET NULL,
  
  -- File Info
  filename VARCHAR(255) NOT NULL,  -- Original filename (displayed to user)
  file_extension VARCHAR(20) NOT NULL,  -- e.g., "pdf", "png"
  mime_type VARCHAR(100) NOT NULL,  -- e.g., "application/pdf"
  file_size BIGINT NOT NULL,  -- In bytes
  
  -- MinIO Paths & Versioning
  minio_bucket VARCHAR(255) NOT NULL,  -- Normalized workspace name
  minio_path VARCHAR(1024) NOT NULL,  -- Full path in MinIO
  minio_version_id VARCHAR(255) NOT NULL,  -- Current MinIO version ID
  minio_etag VARCHAR(255),  -- For integrity checking
  minio_last_modified TIMESTAMP,  -- From MinIO
  
  -- Hierarchical Path (for efficient queries)
  page_slug VARCHAR(255) NOT NULL,  -- "slug-uuid_page_name"
  subpage_slug VARCHAR(255),  -- "slug-uuid_subpage_name"
  
  -- Lifecycle
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP,
  deleted_by UUID,
  soft_delete_at TIMESTAMP,  -- NULL = active, timestamp = soft-deleted
  hard_deleted_at TIMESTAMP,  -- NULL = exists, timestamp = permanently removed
  
  -- Sync & Recovery
  needs_resync BOOLEAN DEFAULT false,  -- True after page rename
  last_sync_at TIMESTAMP,  -- Last reconciliation time
  error_message TEXT,  -- If last sync failed
  retry_count INT DEFAULT 0,
  
  -- Metadata
  is_public BOOLEAN DEFAULT false,  -- Accessible without auth
  download_count INT DEFAULT 0,
  
  -- Constraints
  CHECK (minio_path != ''),
  CHECK (filename != ''),
  CHECK (file_size > 0),
  CHECK (hard_deleted_at IS NULL OR soft_delete_at IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_attachments_workspace_id ON attachments(workspace_id);
CREATE INDEX idx_attachments_page_id ON attachments(page_id);
CREATE INDEX idx_attachments_created_by ON attachments(created_by);
CREATE INDEX idx_attachments_created_at ON attachments(created_at DESC);

-- Partial indexes (for active attachments only)
CREATE INDEX idx_attachments_active_by_workspace 
  ON attachments(workspace_id) 
  WHERE soft_delete_at IS NULL AND hard_deleted_at IS NULL;

CREATE INDEX idx_attachments_active_by_page 
  ON attachments(page_id) 
  WHERE soft_delete_at IS NULL AND hard_deleted_at IS NULL;

-- For garbage collection
CREATE INDEX idx_attachments_soft_deleted 
  ON attachments(soft_delete_at) 
  WHERE soft_delete_at IS NOT NULL AND hard_deleted_at IS NULL;

CREATE INDEX idx_attachments_needs_resync 
  ON attachments(workspace_id, needs_resync) 
  WHERE needs_resync = true AND soft_delete_at IS NULL;

-- For reconciliation
CREATE INDEX idx_attachments_last_sync 
  ON attachments(last_sync_at, workspace_id);
```

#### 2. `attachment_version_history` (Audit Trail)

Tracks all attachment changes for audit and compliance.

```sql
CREATE TABLE attachment_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Change Info
  action VARCHAR(50) NOT NULL,  -- 'CREATED', 'UPDATED', 'DELETED', 'RENAMED'
  actor_id UUID NOT NULL REFERENCES users(id),
  
  -- Before/After Snapshots
  old_values JSONB,  -- Previous state
  new_values JSONB,  -- New state
  
  -- MinIO Versioning
  minio_version_id VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (action IN ('CREATED', 'UPDATED', 'DELETED', 'RENAMED', 'RESTORED'))
);

CREATE INDEX idx_attachment_version_history_attachment_id 
  ON attachment_version_history(attachment_id);
CREATE INDEX idx_attachment_version_history_actor_id 
  ON attachment_version_history(actor_id);
CREATE INDEX idx_attachment_version_history_created_at 
  ON attachment_version_history(created_at DESC);
```

#### 3. `attachment_locks` (Distributed Locks)

Prevents concurrent modifications to the same attachment.

```sql
CREATE TABLE attachment_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL UNIQUE REFERENCES attachments(id) ON DELETE CASCADE,
  locked_by UUID NOT NULL REFERENCES users(id),
  locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,  -- 30 seconds TTL
  
  CHECK (expires_at > locked_at)
);

CREATE INDEX idx_attachment_locks_expires_at ON attachment_locks(expires_at);
```

#### 4. `attachment_orphan_markers` (GC Staging)

Marks objects detected as orphaned, with grace period before hard delete.

```sql
CREATE TABLE attachment_orphan_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  minio_path VARCHAR(1024) NOT NULL,
  minio_bucket VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL,  -- e.g., 'NOT_IN_DB', 'SOFT_DELETE_EXPIRED'
  
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hard_delete_after TIMESTAMP NOT NULL,  -- 7-day grace period
  
  -- Reconciliation
  deletion_attempted_at TIMESTAMP,
  deletion_error TEXT,
  
  UNIQUE(minio_bucket, minio_path)
);

CREATE INDEX idx_orphan_markers_hard_delete_after 
  ON attachment_orphan_markers(hard_delete_after);
CREATE INDEX idx_orphan_markers_workspace_id 
  ON attachment_orphan_markers(workspace_id);
```

#### 5. `workspace_minio_settings` (Plugin Configuration)

Stores MinIO configuration per workspace.

```sql
CREATE TABLE workspace_minio_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- MinIO Connection
  minio_endpoint VARCHAR(255) NOT NULL,  -- "localhost:9000" or "minio.example.com"
  minio_access_key VARCHAR(255) NOT NULL,
  minio_secret_key VARCHAR(255) NOT NULL,  -- Encrypted in production
  minio_use_ssl BOOLEAN DEFAULT false,
  
  -- Bucket Info
  minio_bucket_name VARCHAR(255) NOT NULL,  -- Normalized workspace name
  bucket_created_at TIMESTAMP,
  
  -- Garbage Collection Settings
  gc_soft_delete_grace_days INT DEFAULT 30,  -- Keep soft-deleted for N days
  gc_version_retention_days INT DEFAULT 90,  -- Keep versions for N days (configurable)
  gc_last_run_at TIMESTAMP,
  
  -- Status
  is_enabled BOOLEAN DEFAULT true,
  is_configured BOOLEAN DEFAULT false,  -- Has valid credentials
  health_check_at TIMESTAMP,
  health_status VARCHAR(50),  -- 'healthy', 'degraded', 'unreachable'
  health_message TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workspace_minio_settings_enabled 
  ON workspace_minio_settings(workspace_id) 
  WHERE is_enabled = true;
```

---

## Plugin Structure

### Directory Layout

```
packages/plugin-minio/
├── src/
│   ├── index.ts                 # Plugin entry point
│   ├── config.ts                # Plugin configuration schema
│   ├── hooks.ts                 # Hook implementations
│   │
│   ├── services/
│   │   ├── MinioService.ts      # MinIO client & operations
│   │   ├── AttachmentService.ts # Business logic
│   │   ├── GarbageCollector.ts  # Cleanup jobs
│   │   └── Reconciler.ts        # MinIO ↔ DB sync
│   │
│   ├── api/
│   │   ├── routes.ts            # Express route handlers
│   │   ├── upload.ts            # POST /api/attachments/upload
│   │   ├── download.ts          # GET /api/attachments/{id}/download
│   │   ├── delete.ts            # DELETE /api/attachments/{id}
│   │   ├── list.ts              # GET /api/attachments/page/{pageId}
│   │   └── settings.ts          # GET/PUT /api/workspace/minio-settings
│   │
│   ├── middleware/
│   │   ├── validateMinioConfig.ts    # Check MinIO is configured
│   │   ├── validatePermissions.ts    # Check user can access
│   │   └── attachmentLocking.ts      # Distributed lock handling
│   │
│   ├── jobs/
│   │   ├── gcDaily.ts           # Daily GC job
│   │   ├── gcMonthly.ts         # Monthly version cleanup
│   │   ├── reconciliation.ts    # Hourly sync
│   │   └── lockCleanup.ts       # Every 5min
│   │
│   ├── migrations/
│   │   └── YYYYMMDD_minio_schema.ts  # Kysely migration
│   │
│   ├── utils/
│   │   ├── pathBuilder.ts       # Generate MinIO paths
│   │   ├── nameNormalizer.ts    # Workspace/page name → slug
│   │   └── fileHandler.ts       # File validation, hashing
│   │
│   └── types.ts                 # TypeScript interfaces
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## API Endpoints

### Authentication
All endpoints require user authentication (JWT token in Authorization header).

### 1. Upload Attachment

**POST** `/api/v1/attachments/upload`

Upload a single or multiple files to a page/subpage.

```typescript
// Request
{
  headers: {
    "Authorization": "Bearer <token>",
    "Content-Type": "multipart/form-data"
  },
  body: FormData {
    files: [File, File, ...],           // 1-100 files
    pageId: string,                     // Required
    subpageId?: string,                 // Optional
    workspaceId: string                 // Required (from JWT scope)
  }
}

// Response 200 OK
{
  success: true,
  data: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      workspace_id: "ws-123",
      page_id: "page-456",
      subpage_id: null,
      filename: "document.pdf",
      file_extension: "pdf",
      mime_type: "application/pdf",
      file_size: 1024000,
      minio_path: "my_workspace/slug-123_my_page/document_uuid.pdf",
      created_by: "user-789",
      created_at: "2026-06-28T10:30:00Z"
    }
  ]
}

// Error 400 Bad Request
{
  error: "INVALID_FILE_TYPE",
  message: "File type .exe not allowed",
  allowed_types: ["pdf", "png", "jpg", "docx", ...]
}

// Error 507 Insufficient Storage
{
  error: "WORKSPACE_QUOTA_EXCEEDED",
  message: "Workspace storage limit reached",
  used: 107374182400,  // 100 GB
  limit: 107374182400
}
```

### 2. Download Attachment

**GET** `/api/v1/attachments/{attachmentId}/download`

Download a single attachment with version control.

```typescript
// Query Parameters
?version=<versionId>    // Optional: download specific version

// Response 200 OK
{
  headers: {
    "Content-Type": "<mime_type>",
    "Content-Length": "<file_size>",
    "Content-Disposition": "attachment; filename=\"<filename>\"",
    "X-MinIO-Version-Id": "<versionId>"
  },
  body: <binary file data>
}

// Error 404 Not Found
{
  error: "ATTACHMENT_NOT_FOUND",
  message: "Attachment has been deleted"
}
```

### 3. Delete Attachment

**DELETE** `/api/v1/attachments/{attachmentId}`

Hard delete all versions of an attachment.

```typescript
// Response 200 OK
{
  success: true,
  message: "Attachment deleted",
  data: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    deleted_at: "2026-06-28T10:35:00Z",
    versions_deleted: 3
  }
}

// Error 403 Forbidden
{
  error: "PERMISSION_DENIED",
  message: "Only attachment creator or workspace admin can delete"
}
```

### 4. List Page Attachments

**GET** `/api/v1/attachments/page/{pageId}`

List all attachments on a page/subpage with pagination.

```typescript
// Query Parameters
?subpageId=<id>         // Filter by subpage
?limit=50               // Default: 20, Max: 100
?offset=0               // Default: 0
?sortBy=created_at      // Default: created_at
?sortOrder=desc         // Default: desc

// Response 200 OK
{
  success: true,
  data: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      filename: "document.pdf",
      mime_type: "application/pdf",
      file_size: 1024000,
      created_by_name: "John Doe",
      created_at: "2026-06-28T10:30:00Z",
      download_count: 5
    }
  ],
  pagination: {
    total: 42,
    limit: 20,
    offset: 0
  }
}
```

### 5. Get MinIO Settings

**GET** `/api/v1/workspace/{workspaceId}/minio-settings`

Get MinIO configuration for a workspace (admin only).

```typescript
// Response 200 OK
{
  success: true,
  data: {
    workspace_id: "ws-123",
    minio_endpoint: "minio.example.com:9000",
    minio_bucket_name: "my_workspace",
    is_configured: true,
    is_enabled: true,
    health_status: "healthy",
    gc_soft_delete_grace_days: 30,
    gc_version_retention_days: 90,
    storage_used: 5368709120,  // 5 GB
    storage_limit: 107374182400,  // 100 GB
    last_sync_at: "2026-06-28T11:00:00Z"
  }
}
```

### 6. Update MinIO Settings

**PUT** `/api/v1/workspace/{workspaceId}/minio-settings`

Update MinIO configuration (admin only).

```typescript
// Request
{
  minio_endpoint: "minio.example.com:9000",
  minio_access_key: "minioadmin",
  minio_secret_key: "minioadmin",
  minio_use_ssl: true,
  gc_soft_delete_grace_days: 30,
  gc_version_retention_days: 90
}

// Response 200 OK
{
  success: true,
  message: "Settings updated and bucket initialized",
  data: {
    minio_bucket_name: "my_workspace",
    bucket_created_at: "2026-06-28T11:30:00Z",
    health_status: "healthy"
  }
}

// Error 503 Service Unavailable
{
  error: "MINIO_UNREACHABLE",
  message: "Cannot connect to MinIO at minio.example.com:9000",
  health_status: "unreachable"
}
```

---

## MinIO Configuration

### Bucket Setup

#### Per-Workspace Bucket Strategy

Each workspace gets its own bucket (isolated, easy audit):

```
Bucket name: <workspace_name>.toLowerCase().replace(/\s+/g, '_')

Examples:
- "My Workspace" → "my_workspace"
- "ACME-Corp" → "acme_corp"
- "Finance 2024" → "finance_2024"

Versioning: ENABLED on every bucket
  - Stores all previous versions of objects
  - Delete operations mark as deleted, don't remove from storage
  - GC job periodically removes old versions

Retention: Configurable per workspace
  - Default: Keep versions for 90 days
  - Soft-delete grace: 30 days (before hard delete from DB)
```

#### Path Structure

```
Bucket: my_workspace
├── slug-123_home_page/
│   ├── screenshot_550e8400.png
│   ├── proposal_e29b41d4.pdf
│   └── flowchart_a716446.svg
│
├── slug-456_documentation/
│   ├── slug-789_architecture/
│   │   ├── diagram_655440000.drawio
│   │   └── spec_550e8400.md
│   │
│   └── slug-790_api/
│       └── openapi_spec_e29b41d4.json
│
└── slug-991_trash/
    ├── old_file_123456.txt
    └── removed_image_789abc.png

Pattern:
workspace_bucket / [page_slug] / [subpage_slug]* / filename_uuid.ext

- page_slug: "slug-{id}_{normalized_name}"
- subpage_slug: Same pattern (hierarchical)
- filename_uuid: "{original_name}_{random_uuid}.{ext}"
```

### MinIO Server Configuration

```yaml
# docker-compose.yml (see section 5 for full config)
minio:
  image: minio/minio:latest
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
    MINIO_CONFIG_ENV_FILE: /etc/config.env
  ports:
    - "9000:9000"  # API
    - "9001:9001"  # Console
  volumes:
    - ./data/minio:/data
    - ./minio-init.sh:/docker-entrypoint-initdb.d/minio-init.sh
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 30s
    timeout: 20s
    retries: 3
```

### Versioning & Retention

```javascript
// Enable versioning on bucket creation
await minioClient.setBucketVersioning(bucketName, {
  Status: 'Enabled'
});

// Set lifecycle policy (optional, for auto-expiry)
const lifecyclePolicy = {
  Rules: [
    {
      ID: 'DeleteOldVersions',
      Status: 'Enabled',
      NoncurrentVersionExpirationInDays: 90,  // Delete versions older than 90 days
      Filter: {}
    }
  ]
};
await minioClient.setBucketLifecycle(bucketName, lifecyclePolicy);
```

---

## Docker Setup

### docker-compose.yml Configuration

Add MinIO service to existing docker-compose.yml:

```yaml
version: '3.8'

services:
  # ... existing services (postgres, redis, etc.)

  minio:
    image: minio/minio:latest
    container_name: docmost-minio
    restart: unless-stopped
    
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
      # Enable versioning by default
      MINIO_ARGS: 'server /data --console-address ":9001"'
    
    ports:
      - "${MINIO_API_PORT:-9000}:9000"      # MinIO API
      - "${MINIO_CONSOLE_PORT:-9001}:9001"  # MinIO Console (UI)
    
    volumes:
      - minio_data:/data
      - ./scripts/minio-init.sh:/docker-entrypoint-initdb.d/minio-init.sh
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
      start_period: 10s
    
    networks:
      - docmost

volumes:
  minio_data:
    driver: local

networks:
  docmost:
    driver: bridge
```

### .env Configuration

```bash
# MinIO Service
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false

# Default workspace MinIO settings (can be overridden in UI)
DEFAULT_MINIO_BUCKET_NAME=my_workspace
DEFAULT_MINIO_ACCESS_KEY=minioadmin
DEFAULT_MINIO_SECRET_KEY=minioadmin
DEFAULT_MINIO_USE_SSL=false

# Plugin Configuration
MINIO_PLUGIN_ENABLED=true
MINIO_MAX_FILE_SIZE=104857600  # 100 MB
MINIO_ALLOWED_MIME_TYPES=image/*,application/pdf,application/msword,text/*
```

### Initialization Script (minio-init.sh)

```bash
#!/bin/bash

# Wait for MinIO to be ready
until curl -f http://localhost:9000/minio/health/live; do
  echo "Waiting for MinIO to start..."
  sleep 2
done

# Set MinIO credentials
export MINIO_ROOT_USER=${MINIO_ROOT_USER:-minioadmin}
export MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minioadmin}

echo "MinIO initialized successfully"
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Weeks 1-2)

**Deliverables:**
- Database migrations (schema tables)
- MinIO service client wrapper
- Workspace settings UI + API endpoints
- Basic upload/download endpoints (no versioning yet)

**Tasks:**
- [ ] Create database schema (attachments, workspace_minio_settings)
- [ ] Build MinioService (connect, bucket ops)
- [ ] Implement workspace settings UI (configure endpoint, credentials)
- [ ] Build upload handler (direct to MinIO, store metadata)
- [ ] Build download handler (retrieve from MinIO)
- [ ] Write unit tests for MinioService
- [ ] Setup docker-compose with MinIO

**Acceptance Criteria:**
- Upload file to page → appears in MinIO bucket + DB
- Download file → retrievable from MinIO
- Workspace settings saved → MinIO bucket created automatically
- Docker compose starts MinIO without errors

---

### Phase 2: Deletion & Lifecycle (Weeks 3-4)

**Deliverables:**
- Hard delete implementation
- Soft-delete with grace period
- Page rename sync (rename/move MinIO objects)
- Attachment lock mechanism

**Tasks:**
- [ ] Implement hard delete (all versions)
- [ ] Add soft-delete with 30-day grace period
- [ ] Create attachment_locks table + locking middleware
- [ ] Implement page.onUpdate() hook to sync renames
- [ ] Add status tracking (needs_resync, last_sync_at)
- [ ] Write integration tests for delete flows
- [ ] Handle concurrent upload/delete scenarios

**Acceptance Criteria:**
- Delete attachment → removed from MinIO + marked in DB
- Rename page → MinIO paths updated, no orphans
- Concurrent uploads → handled by distributed lock
- Soft-deleted files → recoverable for 30 days via reconciliation

---

### Phase 3: Background Jobs (Weeks 5-6)

**Deliverables:**
- Daily garbage collection (delete markers)
- Monthly version cleanup (> 3 months old)
- Hourly reconciliation (MinIO ↔ DB sync)
- Lock cleanup (every 5 min)
- Job monitoring + alerting

**Tasks:**
- [ ] Build gcDaily job (delete soft-deleted > 30 days)
- [ ] Build gcMonthly job (purge old versions)
- [ ] Build reconciliation job (list MinIO vs DB compare)
- [ ] Build lock cleanup job
- [ ] Add job scheduling (Bull/BullMQ, or node-cron)
- [ ] Add job monitoring (logs, metrics, error alerts)
- [ ] Write tests for each job scenario
- [ ] Document retry logic + failure recovery

**Acceptance Criteria:**
- Daily GC runs at scheduled time, logs results
- Monthly cleanup removes versions > 3 months old
- Reconciliation detects + marks orphaned objects
- Lock cleanup removes expired locks

---

### Phase 4: Versioning & Recovery (Weeks 7-8)

**Deliverables:**
- MinIO object versioning integration
- Version history audit trail (attachment_version_history)
- Version restore capability (download specific version)
- Orphan markers + grace period

**Tasks:**
- [ ] Enable MinIO versioning per bucket
- [ ] Track minio_version_id in attachments table
- [ ] Build audit trail (who, what, when)
- [ ] Implement version download API
- [ ] Add orphan marker table + grace logic
- [ ] Build recovery tool (restore soft-deleted files)
- [ ] Write tests for version scenarios
- [ ] Document version retention policy

**Acceptance Criteria:**
- Upload same file twice → 2 versions in MinIO
- Download specific version → works correctly
- Audit trail shows all changes (create, update, delete)
- Orphaned files marked with 7-day grace before hard-delete

---

### Phase 5: Testing & Documentation (Weeks 9-10)

**Deliverables:**
- End-to-end test suite
- Load testing (concurrent uploads)
- Disaster recovery runbook
- User documentation
- Migration guide (for existing attachments)

**Tasks:**
- [ ] Write E2E tests (upload → download → delete → recover)
- [ ] Load test (1000 concurrent uploads, page with 100 attachments)
- [ ] Chaos test (MinIO unavailable, network partition)
- [ ] Write runbooks: backup, restore, recover orphaned files
- [ ] Document admin UI for settings
- [ ] Document per-workspace bucket isolation
- [ ] Migration plan for existing local attachments

**Acceptance Criteria:**
- All E2E tests pass
- Handle 1000 concurrent uploads without data loss
- Recovery from MinIO failure documented
- Admin can restore orphaned files if needed

---

## Background Jobs

### 1. Daily Garbage Collection (Hard Delete)

**Schedule:** Every day at 2:00 AM (configurable)

```typescript
// runs at: 2:00 AM daily
async function gcDailyHardDelete() {
  const workspaces = await getWorkspacesWithMinIO();
  
  for (const workspace of workspaces) {
    const settings = await getMinioSettings(workspace.id);
    const gracedays = settings.gc_soft_delete_grace_days; // Default: 30
    
    // Find soft-deleted attachments older than grace period
    const orphaned = await db.attachments.findMany({
      where: {
        workspace_id: workspace.id,
        soft_delete_at: {
          lt: dateSubtractDays(new Date(), gracedays)
        },
        hard_deleted_at: null
      }
    });
    
    for (const attachment of orphaned) {
      // Delete all versions from MinIO
      await minioClient.removeObject(attachment.minio_bucket, attachment.minio_path);
      
      // Hard-delete from DB
      await db.attachments.update({
        where: { id: attachment.id },
        data: { hard_deleted_at: new Date() }
      });
      
      // Log to audit trail
      await logAction('HARD_DELETED', attachment.id, 'gc_job');
    }
    
    // Update job status
    await updateMinioSettings(workspace.id, {
      gc_last_run_at: new Date()
    });
  }
}
```

### 2. Monthly Version Cleanup

**Schedule:** First day of each month at 3:00 AM (configurable)

```typescript
// runs at: 3:00 AM on 1st of each month
async function gcMonthlyVersionCleanup() {
  const workspaces = await getWorkspacesWithMinIO();
  
  for (const workspace of workspaces) {
    const settings = await getMinioSettings(workspace.id);
    const retentionDays = settings.gc_version_retention_days; // Default: 90
    
    // Find attachments with versions older than retention
    const attachments = await db.attachments.findMany({
      where: {
        workspace_id: workspace.id,
        soft_delete_at: null
      },
      select: { id, minio_path, minio_bucket }
    });
    
    for (const attachment of attachments) {
      // List all versions
      const versions = await minioClient.listVersions(
        attachment.minio_bucket,
        attachment.minio_path
      );
      
      const cutoffDate = dateSubtractDays(new Date(), retentionDays);
      
      for (const version of versions) {
        if (new Date(version.lastModified) < cutoffDate) {
          // Delete this version
          await minioClient.removeObject(
            attachment.minio_bucket,
            attachment.minio_path,
            {
              versionId: version.versionId
            }
          );
        }
      }
    }
  }
}
```

### 3. Hourly Reconciliation (Sync MinIO ↔ DB)

**Schedule:** Every hour on the hour

```typescript
// runs every hour
async function reconciliationJob() {
  const workspaces = await getWorkspacesWithMinIO();
  
  for (const workspace of workspaces) {
    const minioClient = await initMinioClient(workspace.id);
    const bucketName = await getBucketName(workspace.id);
    
    // Step 1: List all objects in MinIO
    const minioObjects = await listAllObjectsInBucket(minioClient, bucketName);
    
    // Step 2: Get all attachments from DB
    const dbAttachments = await db.attachments.findMany({
      where: {
        workspace_id: workspace.id,
        hard_deleted_at: null
      },
      select: { id, minio_path }
    });
    
    // Step 3: Find orphaned objects (in MinIO but not in DB)
    const dbPaths = new Set(dbAttachments.map(a => a.minio_path));
    const orphanedObjects = minioObjects.filter(obj => !dbPaths.has(obj.name));
    
    // Mark as orphaned with 7-day grace period
    for (const obj of orphanedObjects) {
      await markOrphaned(workspace.id, obj.name, 'NOT_IN_DB', 7);
    }
    
    // Step 4: Find missing objects (in DB but not in MinIO)
    const minioPathSet = new Set(minioObjects.map(obj => obj.name));
    const missingObjects = dbAttachments.filter(
      a => !minioPathSet.has(a.minio_path)
    );
    
    // Mark as needs_resync
    for (const attachment of missingObjects) {
      await db.attachments.update({
        where: { id: attachment.id },
        data: {
          needs_resync: true,
          error_message: 'Object not found in MinIO during reconciliation'
        }
      });
    }
    
    // Log reconciliation result
    await updateMinioSettings(workspace.id, {
      last_sync_at: new Date()
    });
  }
}
```

### 4. Lock Cleanup (Every 5 Minutes)

```typescript
// runs every 5 minutes
async function lockCleanupJob() {
  // Remove expired locks
  const now = new Date();
  
  const expiredLocks = await db.attachmentLocks.findMany({
    where: {
      expires_at: { lt: now }
    }
  });
  
  if (expiredLocks.length > 0) {
    await db.attachmentLocks.deleteMany({
      where: {
        id: { in: expiredLocks.map(l => l.id) }
      }
    });
    
    console.log(`[AttachmentLocks] Cleaned up ${expiredLocks.length} expired locks`);
  }
}
```

### Job Scheduling with Bull/BullMQ

```typescript
// jobs/scheduler.ts
import Queue from 'bull';

const gcDailyQueue = new Queue('gc-daily', { redis: redisClient });
const gcMonthlyQueue = new Queue('gc-monthly', { redis: redisClient });
const reconcileQueue = new Queue('reconcile', { redis: redisClient });
const lockCleanupQueue = new Queue('lock-cleanup', { redis: redisClient });

// Define recurring jobs
await gcDailyQueue.add({}, {
  repeat: {
    cron: '0 2 * * *',  // 2:00 AM daily
    tz: 'UTC'
  },
  removeOnComplete: true
});

await gcMonthlyQueue.add({}, {
  repeat: {
    cron: '0 3 1 * *',  // 3:00 AM on 1st of month
    tz: 'UTC'
  },
  removeOnComplete: true
});

await reconcileQueue.add({}, {
  repeat: {
    cron: '0 * * * *',  // Every hour
    tz: 'UTC'
  },
  removeOnComplete: true
});

await lockCleanupQueue.add({}, {
  repeat: {
    every: 5 * 60 * 1000  // Every 5 minutes
  },
  removeOnComplete: true
});

// Process jobs
gcDailyQueue.process(gcDailyHardDelete);
gcMonthlyQueue.process(gcMonthlyVersionCleanup);
reconcileQueue.process(reconciliationJob);
lockCleanupQueue.process(lockCleanupJob);

// Monitor job failures
gcDailyQueue.on('failed', (job, err) => {
  alertAdmin(`GC daily job failed: ${err.message}`);
});
```

---

## Error Handling & Recovery

### Network Errors (MinIO Unreachable)

```typescript
// Graceful degradation when MinIO is down
async function uploadAttachment(file, pageId) {
  try {
    // Try to upload to MinIO
    const result = await minioClient.putObject(...);
    
    // Store in DB with confirmed status
    await db.attachments.create({
      ...metadata,
      status: 'CONFIRMED'
    });
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      // MinIO unreachable - store as PENDING, retry later
      await db.attachments.create({
        ...metadata,
        status: 'PENDING',
        error_message: error.message,
        retry_count: 0
      });
      
      // Queue for retry
      await uploadRetryQueue.add({
        attachmentId: attachment.id,
        retryCount: 1
      }, { delay: 30000 });  // Retry in 30 seconds
      
      // Inform user of async upload
      return { status: 'ASYNC', message: 'Upload will complete shortly' };
    }
    
    throw error;
  }
}
```

### Data Consistency Recovery

```typescript
// Detect and fix data inconsistencies
async function repairInconsistencies(workspaceId) {
  // Case 1: DB record but no object in MinIO
  const missingInMinio = await detectMissingInMinIO(workspaceId);
  for (const attachment of missingInMinio) {
    await db.attachments.update({
      where: { id: attachment.id },
      data: {
        needs_resync: true,
        error_message: 'Object missing in MinIO'
      }
    });
  }
  
  // Case 2: MinIO object but no DB record (orphaned)
  const orphanedInMinio = await detectOrphaned(workspaceId);
  for (const object of orphanedInMinio) {
    await markOrphaned(workspaceId, object.name, 'NOT_IN_DB', 7);
  }
  
  // Case 3: Soft-deleted in DB but exists in MinIO
  const shouldNotExist = await detectSoftDeletedStillInMinIO(workspaceId);
  for (const object of shouldNotExist) {
    // Will be cleaned by daily GC job
    await markOrphaned(workspaceId, object.name, 'SOFT_DELETED_STALE', 1);
  }
}
```

---

## Migration Strategy

### For Existing Attachments

If Docmost already stores attachments locally:

```typescript
// Migration approach: Dual-storage initially

// Phase 1: New attachments go to MinIO
// Phase 2: Background job migrates existing to MinIO
// Phase 3: Drop local storage after verification

async function migrateExistingAttachments(workspaceId) {
  const localAttachments = await getLocalAttachments(workspaceId);
  const batchSize = 50;
  
  for (let i = 0; i < localAttachments.length; i += batchSize) {
    const batch = localAttachments.slice(i, i + batchSize);
    
    for (const localAttach of batch) {
      try {
        // Read file from local storage
        const fileBuffer = await fs.readFile(localAttach.local_path);
        
        // Upload to MinIO
        const minioPath = buildMinioPath(localAttach);
        await minioClient.putObject(
          bucketName,
          minioPath,
          fileBuffer,
          fileBuffer.length
        );
        
        // Update DB: point to MinIO
        await db.attachments.update({
          where: { id: localAttach.id },
          data: {
            minio_path: minioPath,
            minio_bucket: bucketName,
            migration_status: 'COMPLETED'
          }
        });
        
      } catch (error) {
        // Log failure, skip to next
        console.error(`Failed to migrate attachment ${localAttach.id}:`, error);
        await db.attachments.update({
          where: { id: localAttach.id },
          data: {
            migration_status: 'FAILED',
            error_message: error.message
          }
        });
      }
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/MinioService.test.ts
describe('MinioService', () => {
  describe('generateMinioPath', () => {
    it('should generate valid path for page attachment', () => {
      const path = generateMinioPath({
        workspaceName: 'My Workspace',
        pageSlug: 'slug-123_my_page',
        filename: 'document.pdf'
      });
      
      expect(path).toBe('my_workspace/slug-123_my_page/document_<uuid>.pdf');
    });
    
    it('should handle special characters in filename', () => {
      const path = generateMinioPath({
        workspaceName: 'Test',
        pageSlug: 'page-1',
        filename: 'My Document (2024).pdf'
      });
      
      expect(path).toMatch(/test\/page-1\/my_document_2024_[a-f0-9]{8}\.pdf/);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/attachment-lifecycle.test.ts
describe('Attachment Lifecycle', () => {
  it('should upload, download, and delete attachment', async () => {
    const workspace = await createTestWorkspace();
    const page = await createTestPage(workspace.id);
    
    // Upload
    const file = Buffer.from('test content');
    const attachment = await attachmentService.upload(workspace.id, page.id, file, {
      filename: 'test.txt',
      mime_type: 'text/plain'
    });
    
    expect(attachment.id).toBeDefined();
    expect(attachment.minio_path).toBeDefined();
    
    // Verify in MinIO
    const exists = await minioClient.statObject(
      attachment.minio_bucket,
      attachment.minio_path
    );
    expect(exists).toBeDefined();
    
    // Download
    const downloaded = await attachmentService.download(workspace.id, attachment.id);
    expect(downloaded).toEqual(file);
    
    // Delete
    await attachmentService.delete(workspace.id, attachment.id);
    
    // Verify soft-deleted
    const deleted = await db.attachments.findUnique({
      where: { id: attachment.id }
    });
    expect(deleted.soft_delete_at).toBeDefined();
    expect(deleted.hard_deleted_at).toBeNull();
  });
});
```

### Load Tests

```bash
# Test 100 concurrent uploads
ab -n 100 -c 10 -p file.bin http://localhost:3000/api/v1/attachments/upload

# Simulate 1000 downloads concurrently
locust -f tests/load/download_test.py --host http://localhost:3000
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (unit, integration, load)
- [ ] Database migrations reviewed and tested
- [ ] MinIO configuration tested in staging
- [ ] Disaster recovery runbook documented
- [ ] Admin documentation written
- [ ] Metrics/alerts configured (MinIO health, job failures)
- [ ] Rollback plan documented

### Deployment Steps

1. **Database Migration**
   ```bash
   npm run migrate:up
   ```

2. **Start MinIO Service**
   ```bash
   docker-compose up -d minio
   ```

3. **Verify MinIO Health**
   ```bash
   curl http://localhost:9000/minio/health/live
   ```

4. **Deploy Plugin**
   ```bash
   npm run build
   npm run deploy
   ```

5. **Run Background Jobs**
   ```bash
   npm run start:jobs
   ```

6. **Verify Plugin Status**
   - [ ] Upload attachment to test page
   - [ ] File appears in MinIO bucket
   - [ ] Download works
   - [ ] Delete works
   - [ ] Background job logs clean

### Post-Deployment

- [ ] Monitor MinIO CPU/memory/disk
- [ ] Monitor job execution logs
- [ ] Check for reconciliation errors
- [ ] Verify audit trail entries
- [ ] Test disaster recovery

---

## Conclusion

This implementation plan provides a production-ready blueprint for the MinIO attachment storage plugin. The modular approach allows for incremental development and testing, with clear milestones and acceptance criteria for each phase.

**Next Steps:**
1. Review and approve this plan with team
2. Create Jira/Linear tickets for each phase
3. Begin Phase 1 implementation
4. Setup staging environment for testing
5. Document runbooks as implementation progresses

