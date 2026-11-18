import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// Optional calendar month 'YYYY-MM' (defaults to the current month).
export class WorkspaceMonthDto {
  @IsOptional()
  @IsString()
  @Matches(MONTH_PATTERN, { message: 'month must be in YYYY-MM format' })
  month?: string;
}

export class SpaceMonthDto extends WorkspaceMonthDto {
  @IsUUID()
  spaceId: string;
}
