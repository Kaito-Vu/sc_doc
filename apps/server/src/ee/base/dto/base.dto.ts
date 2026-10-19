import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PageIdDto } from '../../../core/page/dto/page.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { JsonValue } from '@docmost/db/types/db';

// Explicit DTO classes so the global ValidationPipe (whitelist + transform)
// actually validates and strips these bodies — inline object types are
// reflected as `Object` and bypass validation entirely.

export class CreateBaseDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  pageId?: string;
}

export class UpdateBaseDto extends PageIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ConvertBaseDto extends PageIdDto {
  @IsOptional()
  @IsString()
  template?: string;
}

export class ListBasesDto extends PaginationOptions {
  @IsUUID()
  spaceId: string;
}

export class ExpandPagesDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  pageIds: string[];
}

export class CreatePropertyDto extends PageIdDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsObject()
  typeOptions?: JsonValue;
}

export class PropertyIdDto extends PageIdDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;
}

export class UpdatePropertyDto extends PropertyIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  typeOptions?: JsonValue;
}

export class ReorderPropertyDto extends PropertyIdDto {
  @IsString()
  @IsNotEmpty()
  position: string;
}

export class CreateRowDto extends PageIdDto {
  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsUUID()
  afterRowId?: string;
}

export class RowIdDto extends PageIdDto {
  @IsUUID()
  rowId: string;
}

export class UpdateRowDto extends RowIdDto {
  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  position?: string;
}

export class ReorderRowDto extends RowIdDto {
  @IsString()
  @IsNotEmpty()
  position: string;
}

export class DeleteRowsDto extends PageIdDto {
  @IsArray()
  @ArrayMaxSize(10000)
  @IsUUID('all', { each: true })
  rowIds: string[];
}

export class ListRowsDto extends PaginationOptions {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class CreateViewDto extends PageIdDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: JsonValue;
}

export class ViewIdDto extends PageIdDto {
  @IsUUID()
  viewId: string;
}

export class UpdateViewDto extends ViewIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: JsonValue;

  @IsOptional()
  @IsString()
  position?: string;
}
