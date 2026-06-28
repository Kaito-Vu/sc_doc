export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  region?: string;
}

export interface MinioObjectStat {
  size: number;
  etag: string;
  lastModified: Date;
  metaData?: Record<string, string>;
}

export interface AttachmentMetadata {
  id: string;
  workspaceId: string;
  pageId: string;
  subpageId?: string;
  filename: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  minioBucket: string;
  minioPath: string;
  minioVersionId: string;
  minioEtag?: string;
  minioLastModified?: Date;
  pageSlug: string;
  subpageSlug?: string;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  softDeleteAt?: Date;
  hardDeletedAt?: Date;
  needsResync: boolean;
  lastSyncAt?: Date;
  errorMessage?: string;
  retryCount: number;
  downloadCount: number;
}

export interface UploadAttachmentRequest {
  pageId: string;
  subpageId?: string;
  file: Buffer;
  filename: string;
  mimeType: string;
}

export interface ListAttachmentsOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'filename' | 'file_size';
  sortOrder?: 'asc' | 'desc';
}

export interface WorkspaceMinioSettings {
  id: string;
  workspaceId: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioUseSsl: boolean;
  minioBucketName: string;
  bucketCreatedAt?: Date;
  gcSoftDeleteGraceDays: number;
  gcVersionRetentionDays: number;
  gcLastRunAt?: Date;
  isEnabled: boolean;
  isConfigured: boolean;
  healthStatus?: string;
  healthMessage?: string;
  minioHostNew?: string;
  migrationStatus?: 'idle' | 'in_progress' | 'completed' | 'failed';
  migrationProgress?: number;
  migrationTotalFiles?: number;
  migrationProcessedFiles?: number;
  migrationStartedAt?: Date;
  migrationEta?: Date;
  migrationError?: string;
  lastSuccessfulHost?: string;
  encryptedSecretKey?: string;
  hostChangeRequestedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentLock {
  id: string;
  attachmentId: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

export interface OrphanMarker {
  id: string;
  workspaceId: string;
  minioPath: string;
  minioBucket: string;
  reason: string;
  markedAt: Date;
  hardDeleteAfter: Date;
  deletionAttemptedAt?: Date;
  deletionError?: string;
}
