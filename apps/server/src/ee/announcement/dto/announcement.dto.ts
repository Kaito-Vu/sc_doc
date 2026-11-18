import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_COLORS,
  ANNOUNCEMENT_MAX_TITLE_LENGTH,
  ANNOUNCEMENT_TYPES,
} from '../announcement.utils';

export class AnnouncementInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ANNOUNCEMENT_MAX_TITLE_LENGTH)
  title: string;

  @IsIn(ANNOUNCEMENT_TYPES)
  type: string;

  @IsIn(ANNOUNCEMENT_COLORS)
  color: string;

  @IsObject()
  content: any;

  @IsBoolean()
  isDismissible: boolean;

  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience: string;

  @ValidateIf((_, v) => v != null)
  @IsISO8601()
  startsAt?: string | null;

  @ValidateIf((_, v) => v != null)
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class UpdateAnnouncementDto extends AnnouncementInputDto {
  @IsUUID()
  announcementId: string;
}

export class AnnouncementIdDto {
  @IsUUID()
  announcementId: string;
}

export class ListAnnouncementsDto extends PaginationOptions {
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  status?: 'active' | 'archived' | 'all';
}
