import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class UpdateMinioSettingsDto {
  @IsString()
  minioEndpoint: string;

  @IsString()
  minioAccessKey: string;

  @IsString()
  minioSecretKey: string;

  @IsBoolean()
  @IsOptional()
  minioUseSsl?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  gcSoftDeleteGraceDays?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  gcVersionRetentionDays?: number;
}

export class TestMinioConnectionDto {
  @IsString()
  minioEndpoint: string;

  @IsString()
  minioAccessKey: string;

  @IsString()
  minioSecretKey: string;

  @IsBoolean()
  @IsOptional()
  minioUseSsl?: boolean;
}

export class StartMigrationDto {
  @IsString()
  newEndpoint: string;

  @IsString()
  accessKey: string;

  @IsString()
  secretKey: string;

  @IsBoolean()
  @IsOptional()
  useSSL?: boolean;
}

export class MigrationStatusDto {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  processedFiles: number;
  totalFiles: number;
  eta?: Date;
  error?: string;
  remainingTime?: string;
}

export class GetMinioConfigDto {
  workspaceId: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioUseSsl: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  healthStatus?: string;
}

export class TestConnectionResponseDto {
  success: boolean;
  message?: string;
}

export class UploadAttachmentDto {
  @IsString()
  pageId: string;

  @IsString()
  @IsOptional()
  subpageId?: string;
}

export class ListAttachmentsDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number = 0;

  @IsString()
  @IsOptional()
  sortBy?: 'created_at' | 'filename' | 'file_size' = 'created_at';

  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class GetMinioSettingsResponseDto {
  workspaceId: string;
  minioBucketName: string;
  isConfigured: boolean;
  isEnabled: boolean;
  healthStatus?: string;
  gcSoftDeleteGraceDays: number;
  gcVersionRetentionDays: number;
  storageUsed: number;
  storageLimit: number;
  lastSyncAt?: Date;
}

export class AttachmentResponseDto {
  id: string;
  filename: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  createdBy: string;
  createdAt: Date;
  downloadCount: number;
  minioPath: string;
}

export class ListAttachmentsResponseDto {
  data: AttachmentResponseDto[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}
