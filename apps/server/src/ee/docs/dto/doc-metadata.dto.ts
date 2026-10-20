import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DOC_CLASSIFICATIONS,
  DOC_METADATA_FILTERS,
} from '../doc-metadata.types';

export class DocMetadataPageDto {
  @IsString()
  pageId: string;
}

export class UpdateDocMetadataDto extends DocMetadataPageDto {
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  reviewerId?: string | null;

  @IsOptional()
  @IsIn([...DOC_CLASSIFICATIONS, null])
  classification?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  docType?: string | null;

  @IsOptional()
  @IsString()
  effectiveAt?: string | null;

  @IsOptional()
  @IsString()
  reviewDueAt?: string | null;

  @IsOptional()
  @IsString()
  archivedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class ListDocMetadataDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];

  @IsOptional()
  @IsIn([...DOC_METADATA_FILTERS])
  filter?: string;

  @IsOptional()
  @IsIn(DOC_CLASSIFICATIONS)
  classification?: string;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class DocMetadataHealthDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}
