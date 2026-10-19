import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageIdDto } from '../../../core/page/dto/page.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

// Mirrors the client limits (MAX_VERIFIERS, PERIOD_UNIT_MAX_AMOUNT.day).
const MAX_VERIFIERS = 5;
const MAX_PERIOD_AMOUNT = 3650;

export const VERIFICATION_TYPES = ['expiring', 'qms'] as const;
export const VERIFICATION_MODES = ['period', 'fixed', 'indefinite'] as const;
export const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;

export class UpdateVerificationDto extends PageIdDto {
  @IsOptional()
  @IsIn(VERIFICATION_MODES)
  mode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PERIOD_AMOUNT)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: string;

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VERIFIERS)
  @IsUUID('all', { each: true })
  verifierIds?: string[];
}

export class SetupVerificationDto extends UpdateVerificationDto {
  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VERIFIERS)
  @IsUUID('all', { each: true })
  verifierIds: string[];
}

export class RejectReviewDto extends PageIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comment: string;
}

export class RejectApprovalDto extends PageIdDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ListVerificationsDto extends PaginationOptions {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  spaceIds?: string[];

  @IsOptional()
  @IsUUID()
  verifierId?: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: string;
}
