import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class AuditQueryDto extends PaginationOptions {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  events?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  actorTypes?: string[];

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;
}

export type AuditQueryFilters = Pick<
  AuditQueryDto,
  | 'event'
  | 'events'
  | 'search'
  | 'resourceType'
  | 'resourceId'
  | 'actorId'
  | 'actorTypes'
  | 'spaceId'
  | 'startDate'
  | 'endDate'
  | 'ipAddress'
>;

// Audit evidence must outlive a short-lived admin decision.
export const MIN_AUDIT_RETENTION_DAYS = 90;

export class UpdateAuditRetentionDto {
  @IsInt()
  @Min(MIN_AUDIT_RETENTION_DAYS)
  @Max(36500)
  auditRetentionDays: number;
}

export class AuditLogDetailDto {
  @IsUUID()
  id: string;
}
