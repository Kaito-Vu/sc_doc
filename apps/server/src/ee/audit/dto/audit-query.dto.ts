import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class AuditQueryDto extends PaginationOptions {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export type AuditQueryFilters = Pick<
  AuditQueryDto,
  'event' | 'resourceType' | 'actorId' | 'spaceId' | 'startDate' | 'endDate'
>;

export class UpdateAuditRetentionDto {
  @IsInt()
  @Min(1)
  @Max(36500)
  auditRetentionDays: number;
}
