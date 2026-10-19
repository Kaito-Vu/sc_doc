import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PageIdDto } from '../../../core/page/dto/page.dto';
import { PagePermissionRole } from '../../../common/helpers/types/permission';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

const MAX_MEMBERS = 100;

export class RemovePagePermissionDto extends PageIdDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERS)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERS)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class AddPagePermissionDto extends RemovePagePermissionDto {
  @IsEnum(PagePermissionRole)
  role: string;
}

export class UpdatePagePermissionDto extends PageIdDto {
  @IsEnum(PagePermissionRole)
  role: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class PagePermissionsDto extends PaginationOptions {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}
