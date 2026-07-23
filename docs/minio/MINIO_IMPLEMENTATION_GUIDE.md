# MinIO Attachment Implementation Guide

This guide explains how to implement the MinIO attachment storage system in Docmost using the schema defined in `MINIO_ATTACHMENT_SCHEMA_DESIGN.md`.

---

## Quick Start

### 1. Run the Migration

```bash
npm run migrate:latest
# or
yarn migrate:latest
```

This applies `20260630T000001-minio-attachment-schema.ts` which:
- Creates `attachment_version_history`, `attachment_locks`, `attachment_orphan_markers` tables
- Adds 10 new columns to `attachments` table
- Creates 11 new indexes
- Adds trigger to cascade page deletion to attachments (soft-delete)
- Backfills existing data (status, soft_deleted_at, minio_path, etc.)

### 2. Start Background Jobs

Create background jobs (or use existing job queue):

```typescript
import { setupAttachmentGC } from './services/attachment-gc';
import { setupAttachmentReconciliation } from './services/attachment-reconciliation';
import { setupLockCleanup } from './services/attachment-locks';

// In your app startup
await setupAttachmentGC();           // Daily GC job
await setupAttachmentReconciliation(); // Hourly reconciliation
await setupLockCleanup();             // Every 5 minutes
```

---

## Service Implementation

### Service 1: Attachment Upload

**File:** `apps/server/src/services/attachment-upload.ts`

```typescript
import { v7 as uuidv7 } from 'uuid';
import { MinioClient } from '../minio/client';
import { db } from '../database';
import { acquireLock, releaseLock } from './attachment-locks';

export async function uploadAttachment(
  workspaceId: string,
  spaceId: string,
  pageId: string,
  parentPageId: string | null,
  file: Express.Multer.File,
  userId: string,
  sessionId: string,
): Promise<Attachment> {
  const fileId = uuidv7();
  const ext = getFileExtension(file.originalname);
  const filename = `${file.originalname.replace(/\.[^.]+$/, '')}-${fileId}.${ext}`;
  
  const minioPath = buildMinioPath(
    workspaceId,
    spaceId,
    pageId,
    parentPageId,
    filename,
  );

  // Acquire lock to prevent concurrent uploads to same page
  const lockId = await acquireLock(
    'attachment',
    pageId,
    sessionId,
    { expiresIn: 5 * 60 * 1000 }, // 5 minute timeout
  );

  try {
    // 1. Create incomplete attachment record
    const attachment = await db
      .insertInto('attachments')
      .values({
        id: fileId,
        minio_path: minioPath,
        filename: file.originalname,
        file_ext: ext,
        mime_type: file.mimetype,
        workspace_id: workspaceId,
        space_id: spaceId,
        page_id: pageId,
        parent_page_id: parentPageId,
        creator_id: userId,
        status: 'active',
        file_size: null,
        uploaded_at: null,
        created_at: new Date(),
      })
      .returning('*')
      .executeTakeFirst();

    if (!attachment) {
      throw new Error('Failed to create attachment record');
    }

    // 2. Upload to MinIO
    const putResponse = await MinioClient.putObject(
      buildBucketName(workspaceId),
      minioPath,
      file.stream || file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
        'Content-Disposition': `inline; filename="${file.originalname}"`,
      },
    );

    // 3. Record version history
    await db
      .insertInto('attachment_version_history')
      .values({
        id: uuidv7(),
        attachment_id: fileId,
        minio_version_id: putResponse.versionId,
        version_number: 1,
        action: 'uploaded',
        actor_id: userId,
        file_size: file.size,
        mime_type: file.mimetype,
        minio_etag: putResponse.etag,
        created_at: new Date(),
      })
      .execute();

    // 4. Mark upload as complete
    const updatedAttachment = await db
      .updateTable('attachments')
      .set({
        file_size: file.size,
        uploaded_at: new Date(),
        minio_version_id: putResponse.versionId,
        minio_etag: putResponse.etag,
        minio_last_modified: new Date(),
        needs_resync: false,
      })
      .where('id', '=', fileId)
      .returning('*')
      .executeTakeFirst();

    return updatedAttachment!;
  } catch (error) {
    logger.error(`Upload failed for ${minioPath}`, error);
    throw error;
  } finally {
    await releaseLock(lockId);
  }
}

function buildMinioPath(
  workspaceId: string,
  spaceId: string,
  pageId: string,
  parentPageId: string | null,
  filename: string,
): string {
  const parentPart = parentPageId || 'null';
  return `${workspaceId}/${spaceId}/${pageId}/${parentPart}/${filename}`;
}

function buildBucketName(workspaceId: string): string {
  return `workspace-${workspaceId}`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
```

### Service 2: Attachment Deletion (Soft-Delete)

**File:** `apps/server/src/services/attachment-delete.ts`

```typescript
import { db } from '../database';

export async function softDeleteAttachment(
  attachmentId: string,
  userId: string,
): Promise<void> {
  const attachment = await db
    .selectFrom('attachments')
    .select('*')
    .where('id', '=', attachmentId)
    .executeTakeFirst();

  if (!attachment) {
    throw new Error('Attachment not found');
  }

  if (attachment.status === 'soft_deleted') {
    throw new Error('Attachment already deleted');
  }

  // Mark as soft-deleted
  await db
    .updateTable('attachments')
    .set({
      status: 'soft_deleted',
      soft_deleted_at: new Date(),
      soft_deleted_by_id: userId,
    })
    .where('id', '=', attachmentId)
    .execute();

  // Record in history
  await db
    .insertInto('attachment_version_history')
    .values({
      id: uuidv7(),
      attachment_id: attachmentId,
      minio_version_id: attachment.minio_version_id,
      version_number: (attachment.version_number || 0) + 1,
      action: 'soft_deleted',
      actor_id: userId,
      file_size: attachment.file_size,
      mime_type: attachment.mime_type,
      minio_etag: attachment.minio_etag,
      created_at: new Date(),
    })
    .execute();
}

export async function restoreAttachment(
  attachmentId: string,
  userId: string,
): Promise<void> {
  const attachment = await db
    .selectFrom('attachments')
    .select('*')
    .where('id', '=', attachmentId)
    .executeTakeFirst();

  if (!attachment) {
    throw new Error('Attachment not found');
  }

  if (attachment.status !== 'soft_deleted') {
    throw new Error('Only soft-deleted attachments can be restored');
  }

  await db
    .updateTable('attachments')
    .set({
      status: 'active',
      soft_deleted_at: null,
      soft_deleted_by_id: null,
    })
    .where('id', '=', attachmentId)
    .execute();

  // Record restore in history
  await db
    .insertInto('attachment_version_history')
    .values({
      id: uuidv7(),
      attachment_id: attachmentId,
      minio_version_id: attachment.minio_version_id,
      version_number: (attachment.version_number || 0) + 1,
      action: 'restored',
      actor_id: userId,
      file_size: attachment.file_size,
      mime_type: attachment.mime_type,
      minio_etag: attachment.minio_etag,
      created_at: new Date(),
    })
    .execute();
}
```

### Service 3: Attachment Locks (Concurrent Upload Safety)

**File:** `apps/server/src/services/attachment-locks.ts`

```typescript
import { v7 as uuidv7 } from 'uuid';
import { db } from '../database';

export async function acquireLock(
  resourceType: 'attachment' | 'page_rename' | 'page_move',
  resourceId: string,
  sessionId: string,
  options?: { expiresIn?: number },
): Promise<string> {
  const expiresIn = options?.expiresIn || 5 * 60 * 1000; // 5 minutes default
  const lockId = uuidv7();
  const expiresAt = new Date(Date.now() + expiresIn);

  try {
    await db
      .insertInto('attachment_locks')
      .values({
        id: lockId,
        locked_resource_type: resourceType,
        locked_resource_id: resourceId,
        holder_session_id: sessionId,
        created_at: new Date(),
        expires_at: expiresAt,
      })
      .execute();

    return lockId;
  } catch (error: any) {
    // Unique constraint violation means lock is held
    if (error.code === '23505') {
      // Check if lock exists and is still valid
      const existingLock = await db
        .selectFrom('attachment_locks')
        .select('expires_at')
        .where('locked_resource_type', '=', resourceType)
        .where('locked_resource_id', '=', resourceId)
        .executeTakeFirst();

      if (existingLock && existingLock.expires_at > new Date()) {
        throw new Error(
          `Resource is locked (expires at ${existingLock.expires_at})`,
        );
      } else {
        // Lock expired, delete it and retry
        await db
          .deleteFrom('attachment_locks')
          .where('locked_resource_type', '=', resourceType)
          .where('locked_resource_id', '=', resourceId)
          .execute();

        return acquireLock(resourceType, resourceId, sessionId, options);
      }
    }

    throw error;
  }
}

export async function releaseLock(lockId: string): Promise<void> {
  await db
    .deleteFrom('attachment_locks')
    .where('id', '=', lockId)
    .execute();
}

export async function cleanupExpiredLocks(): Promise<number> {
  const result = await db
    .deleteFrom('attachment_locks')
    .where('expires_at', '<', new Date())
    .execute();

  return Number(result.numDeletedRows);
}
```

### Service 4: Garbage Collection

**File:** `apps/server/src/services/attachment-gc.ts`

```typescript
import { db } from '../database';
import { MinioClient } from '../minio/client';
import { sql } from 'kysely';

const SOFT_DELETE_GRACE_PERIOD_DAYS = 30; // Configurable per workspace
const LOGGER = getLogger('AttachmentGC');

export async function dailyGarbageCollection(workspaceId: string): Promise<{
  softDeletedCount: number;
  hardDeletedCount: number;
  failedCount: number;
}> {
  let hardDeletedCount = 0;
  let failedCount = 0;

  // Find soft-deleted attachments older than grace period
  const gracePeriodDate = new Date(
    Date.now() - SOFT_DELETE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  const orphans = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'minio_version_id', 'soft_deleted_at'])
    .where('status', '=', 'soft_deleted')
    .where('workspace_id', '=', workspaceId)
    .where('soft_deleted_at', '<', gracePeriodDate)
    .orderBy('soft_deleted_at', 'asc')
    .limit(100) // Batch in chunks
    .execute();

  const bucket = buildBucketName(workspaceId);

  for (const orphan of orphans) {
    try {
      // Delete from MinIO
      await MinioClient.removeObject(bucket, orphan.minio_path, {
        versionId: orphan.minio_version_id,
      });

      // Mark as hard-deleted in DB
      await db
        .updateTable('attachments')
        .set({
          status: 'hard_deleted',
          hard_deleted_at: new Date(),
          needs_resync: false,
        })
        .where('id', '=', orphan.id)
        .execute();

      hardDeletedCount++;
    } catch (error) {
      logger.error(`Failed to hard-delete ${orphan.minio_path}`, error);
      failedCount++;
      // Continue with next; retry next day
    }
  }

  return {
    softDeletedCount: orphans.length,
    hardDeletedCount,
    failedCount,
  };
}

export async function monthlyVersionCleanup(workspaceId: string): Promise<{
  filesProcessed: number;
  versionsDeleted: number;
  failedCount: number;
}> {
  const RETENTION_MONTHS = 3; // Configurable per workspace
  let versionsDeleted = 0;
  let failedCount = 0;

  const attachments = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'minio_version_id'])
    .where('workspace_id', '=', workspaceId)
    .where('status', '=', 'active')
    .execute();

  const bucket = buildBucketName(workspaceId);
  const cutoffDate = new Date(
    Date.now() - RETENTION_MONTHS * 30 * 24 * 60 * 60 * 1000,
  );

  for (const att of attachments) {
    try {
      const versions = await listObjectVersions(bucket, att.minio_path);

      for (const version of versions) {
        if (
          new Date(version.lastModified) < cutoffDate &&
          version.versionId !== att.minio_version_id
        ) {
          // Delete old version (not current)
          await MinioClient.removeObject(bucket, att.minio_path, {
            versionId: version.versionId,
          });
          versionsDeleted++;
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup versions for ${att.minio_path}`, error);
      failedCount++;
    }
  }

  return {
    filesProcessed: attachments.length,
    versionsDeleted,
    failedCount,
  };
}

export async function setupAttachmentGC(): Promise<void> {
  // Daily GC at 2 AM
  schedule('0 2 * * *', async () => {
    const workspaces = await db
      .selectFrom('workspaces')
      .select('id')
      .where('deleted_at', 'is', null)
      .execute();

    for (const ws of workspaces) {
      try {
        const result = await dailyGarbageCollection(ws.id);
        logger.info(`GC for workspace ${ws.id}`, result);
      } catch (error) {
        logger.error(`GC failed for workspace ${ws.id}`, error);
      }
    }
  });

  // Monthly version cleanup on 1st of month at 3 AM
  schedule('0 3 1 * *', async () => {
    const workspaces = await db
      .selectFrom('workspaces')
      .select('id')
      .execute();

    for (const ws of workspaces) {
      try {
        const result = await monthlyVersionCleanup(ws.id);
        logger.info(`Version cleanup for workspace ${ws.id}`, result);
      } catch (error) {
        logger.error(`Version cleanup failed for workspace ${ws.id}`, error);
      }
    }
  });
}
```

### Service 5: Reconciliation (MinIO ↔ DB Sync)

**File:** `apps/server/src/services/attachment-reconciliation.ts`

```typescript
import { db } from '../database';
import { MinioClient } from '../minio/client';
import { sql } from 'kysely';

export async function reconcileAttachmentPaths(
  workspaceId: string,
  batchSize = 100,
): Promise<{ synced: number; orphansFound: number; failedCount: number }> {
  let synced = 0;
  let orphansFound = 0;
  let failedCount = 0;

  // Find items needing resync
  const items = await db
    .selectFrom('attachments')
    .select(['id', 'minio_path', 'workspace_id', 'needs_resync'])
    .where('needs_resync', '=', true)
    .where('workspace_id', '=', workspaceId)
    .limit(batchSize)
    .execute();

  const bucket = buildBucketName(workspaceId);

  for (const item of items) {
    try {
      // Verify file exists in MinIO
      const stat = await MinioClient.statObject(bucket, item.minio_path);

      // Update with current metadata
      await db
        .updateTable('attachments')
        .set({
          minio_version_id: stat.versionId,
          minio_etag: stat.etag,
          minio_last_modified: stat.lastModified,
          last_synced_at: new Date(),
          needs_resync: false,
        })
        .where('id', '=', item.id)
        .execute();

      synced++;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        // File doesn't exist in MinIO; mark as orphan
        await db
          .insertInto('attachment_orphan_markers')
          .values({
            id: uuidv7(),
            workspace_id: workspaceId,
            minio_path: item.minio_path,
            discovered_at: new Date(),
            scheduled_for_deletion: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ), // 7 day grace
          })
          .onConflict((oc) =>
            oc
              .column('minio_path')
              .doUpdateSet({
                discovered_at: new Date(),
              }),
          )
          .execute();

        orphansFound++;

        // Clear the needs_resync flag so we don't keep checking
        await db
          .updateTable('attachments')
          .set({ needs_resync: false })
          .where('id', '=', item.id)
          .execute();
      } else {
        logger.error(`Reconciliation failed for ${item.minio_path}`, error);
        failedCount++;
      }
    }
  }

  return { synced, orphansFound, failedCount };
}

export async function detectOrphanedMinioObjects(
  workspaceId: string,
): Promise<{ orphansFound: number; failedCount: number }> {
  let orphansFound = 0;
  let failedCount = 0;

  // List all objects in MinIO bucket
  const minioObjects = new Set<string>();
  const bucket = buildBucketName(workspaceId);

  try {
    const stream = MinioClient.listObjects(bucket);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        minioObjects.add(obj.name);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  } catch (error) {
    logger.error(`Failed to list MinIO objects for ${workspaceId}`, error);
    return { orphansFound: 0, failedCount: 1 };
  }

  // Get all paths from DB
  const dbPaths = await db
    .selectFrom('attachments')
    .select('minio_path')
    .where('workspace_id', '=', workspaceId)
    .execute();

  const dbPathSet = new Set(dbPaths.map((r) => r.minio_path));

  // Find orphans (in MinIO but not in DB)
  const orphanPaths = Array.from(minioObjects).filter(
    (p) => !dbPathSet.has(p),
  );

  // Record orphans for later deletion
  for (const path of orphanPaths) {
    try {
      await db
        .insertInto('attachment_orphan_markers')
        .values({
          id: uuidv7(),
          workspace_id: workspaceId,
          minio_path: path,
          discovered_at: new Date(),
          scheduled_for_deletion: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ),
        })
        .onConflict((oc) => oc.column('minio_path').doNothing())
        .execute();

      orphansFound++;
    } catch (error) {
      logger.error(`Failed to mark orphan ${path}`, error);
      failedCount++;
    }
  }

  return { orphansFound, failedCount };
}

export async function deleteOrphanedObjects(
  workspaceId: string,
  batchSize = 50,
): Promise<{ deleted: number; failedCount: number }> {
  let deleted = 0;
  let failedCount = 0;

  // Find orphans ready for deletion
  const orphans = await db
    .selectFrom('attachment_orphan_markers')
    .select(['id', 'minio_path', 'minio_version_id'])
    .where('workspace_id', '=', workspaceId)
    .where('scheduled_for_deletion', '<', new Date())
    .where('deleted_at', 'is', null)
    .limit(batchSize)
    .execute();

  const bucket = buildBucketName(workspaceId);

  for (const orphan of orphans) {
    try {
      await MinioClient.removeObject(bucket, orphan.minio_path, {
        versionId: orphan.minio_version_id,
      });

      await db
        .updateTable('attachment_orphan_markers')
        .set({ deleted_at: new Date() })
        .where('id', '=', orphan.id)
        .execute();

      deleted++;
    } catch (error) {
      logger.error(`Failed to delete orphan ${orphan.minio_path}`, error);

      // Record error and increment attempt count
      await db
        .updateTable('attachment_orphan_markers')
        .set({
          last_deletion_error: String(error),
          deletion_attempt_count: sql`deletion_attempt_count + 1`,
        })
        .where('id', '=', orphan.id)
        .execute();

      failedCount++;
    }
  }

  return { deleted, failedCount };
}

export async function setupAttachmentReconciliation(): Promise<void> {
  // Reconcile every hour
  schedule('0 * * * *', async () => {
    const workspaces = await db
      .selectFrom('workspaces')
      .select('id')
      .where('deleted_at', 'is', null)
      .execute();

    for (const ws of workspaces) {
      try {
        const result = await reconcileAttachmentPaths(ws.id);
        logger.info(`Reconciliation for workspace ${ws.id}`, result);

        // Every 12 hours, detect orphaned MinIO objects
        if (new Date().getHours() % 12 === 0) {
          const orphanResult = await detectOrphanedMinioObjects(ws.id);
          logger.info(`Orphan detection for workspace ${ws.id}`, orphanResult);
        }

        // Delete ready orphans
        const deleteResult = await deleteOrphanedObjects(ws.id);
        logger.info(`Orphan deletion for workspace ${ws.id}`, deleteResult);
      } catch (error) {
        logger.error(`Reconciliation failed for workspace ${ws.id}`, error);
      }
    }
  });
}
```

---

## API Endpoints

### POST /api/attachments (Upload)

```typescript
app.post('/api/attachments', authenticateUser, async (req, res) => {
  const { workspaceId, spaceId, pageId } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const attachment = await uploadAttachment(
      workspaceId,
      spaceId,
      pageId,
      null,
      file,
      req.user.id,
      req.sessionID,
    );

    res.json(attachment);
  } catch (error) {
    logger.error('Upload failed', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});
```

### DELETE /api/attachments/:id (Soft-Delete)

```typescript
app.delete('/api/attachments/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    await softDeleteAttachment(id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete failed', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});
```

### POST /api/attachments/:id/restore (Restore)

```typescript
app.post('/api/attachments/:id/restore', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    await restoreAttachment(id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Restore failed', error);
    res.status(500).json({ error: 'Restore failed' });
  }
});
```

### GET /api/pages/:pageId/attachments (List)

```typescript
app.get('/api/pages/:pageId/attachments', authenticateUser, async (req, res) => {
  const { pageId } = req.params;

  const attachments = await db
    .selectFrom('attachments')
    .select([
      'id',
      'filename',
      'file_size',
      'mime_type',
      'created_at',
      'creator_id',
      'status',
    ])
    .where('page_id', '=', pageId)
    .where('status', '=', 'active')
    .orderBy('created_at', 'desc')
    .execute();

  res.json(attachments);
});
```

### GET /api/trash/attachments (Trash Bin)

```typescript
app.get('/api/trash/attachments', authenticateUser, async (req, res) => {
  const { workspaceId } = req.query;

  const trashed = await db
    .selectFrom('attachments')
    .select([
      'id',
      'filename',
      'file_size',
      'mime_type',
      'soft_deleted_at',
      'soft_deleted_by_id',
    ])
    .where('workspace_id', '=', workspaceId)
    .where('status', '=', 'soft_deleted')
    .orderBy('soft_deleted_at', 'desc')
    .limit(100)
    .execute();

  res.json(trashed);
});
```

---

## Database Queries Cheat Sheet

### List active attachments on page

```sql
SELECT * FROM attachments
WHERE page_id = $1 AND status = 'active'
ORDER BY created_at DESC;
```

### Search attachments in workspace

```sql
SELECT * FROM attachments
WHERE workspace_id = $1
  AND status = 'active'
  AND tsv @@ plainto_tsquery($2)
ORDER BY created_at DESC;
```

### Workspace storage report

```sql
SELECT 
  SUM(file_size) as total_bytes,
  COUNT(*) as file_count,
  AVG(file_size) as avg_size
FROM attachments
WHERE workspace_id = $1 AND status = 'active';
```

### User's uploads

```sql
SELECT * FROM attachments
WHERE creator_id = $1
  AND workspace_id = $2
  AND status = 'active'
ORDER BY created_at DESC;
```

### Audit trail

```sql
SELECT 
  ah.action,
  ah.actor_id,
  u.name,
  ah.created_at,
  a.filename
FROM attachment_version_history ah
JOIN users u ON ah.actor_id = u.id
JOIN attachments a ON ah.attachment_id = a.id
WHERE a.workspace_id = $1
ORDER BY ah.created_at DESC;
```

### Find incomplete uploads (for cleanup)

```sql
SELECT id, filename, created_at
FROM attachments
WHERE uploaded_at IS NULL
  AND status = 'active'
  AND created_at < now() - INTERVAL '1 hour'
  AND workspace_id = $1;
```

### Count items needing resync

```sql
SELECT COUNT(*) FROM attachments
WHERE needs_resync = TRUE
  AND workspace_id = $1;
```

---

## Testing

### Manual Test: Upload → Delete → Restore

```typescript
describe('Attachment lifecycle', () => {
  it('should upload, soft-delete, and restore', async () => {
    // 1. Upload
    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test content'),
    };

    const att = await uploadAttachment(
      workspaceId,
      spaceId,
      pageId,
      null,
      file as any,
      userId,
      sessionId,
    );

    expect(att.status).toBe('active');
    expect(att.uploaded_at).toBeTruthy();

    // 2. Soft-delete
    await softDeleteAttachment(att.id, userId);

    let updated = await db
      .selectFrom('attachments')
      .selectAll()
      .where('id', '=', att.id)
      .executeTakeFirst();

    expect(updated?.status).toBe('soft_deleted');
    expect(updated?.soft_deleted_at).toBeTruthy();

    // 3. Restore
    await restoreAttachment(att.id, userId);

    updated = await db
      .selectFrom('attachments')
      .selectAll()
      .where('id', '=', att.id)
      .executeTakeFirst();

    expect(updated?.status).toBe('active');
    expect(updated?.soft_deleted_at).toBeNull();
  });
});
```

---

## Troubleshooting

### High Lock Contention
- Increase lock timeout: `expiresIn: 10 * 60 * 1000` (10 minutes)
- Check if uploads to same page are concurrent; consider queuing

### Many Orphans Accumulating
- Verify MinIO bucket is healthy: `aws s3 ls workspace-{id}/`
- Check `attachment_orphan_markers.last_deletion_error` for details
- Manually trigger `deleteOrphanedObjects()` if GC is falling behind

### Slow Full-Text Search
- Rebuild GIN index: `REINDEX INDEX attachments_tsv_idx;`
- Check query plan: `EXPLAIN SELECT * FROM attachments WHERE tsv @@ ...`
- Consider Elasticsearch if workspace has 1M+ attachments

### Reconciliation Falling Behind
- Increase batch size: `reconcileAttachmentPaths(workspaceId, 500)`
- Run more frequently: `schedule('*/15 * * * *', ...)`
- Check database connection pool; may be exhausted

---

## Performance Considerations

- **Batch operations** in chunks of 100-1000
- **Partial indexes** exclude soft-deleted from scans
- **Denormalized fields** (parent_page_id, workspace_id) speed up queries
- **Async reconciliation** prevents blocking uploads/deletes
- **Grace period** prevents accidental loss but allows eventual cleanup
