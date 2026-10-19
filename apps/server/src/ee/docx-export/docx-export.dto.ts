import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { PageIdDto } from '../../core/page/dto/page.dto';
import { DocxExportOptions } from './docx-export.constants';

// Lengths are capped (sliced) in DocxExportJobService.enqueue.
export class DocxExportDto extends PageIdDto implements DocxExportOptions {
  @IsOptional()
  @IsBoolean()
  includeChildren?: boolean;

  @IsOptional()
  @IsBoolean()
  singleFile?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  order?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclude?: string[];

  @IsOptional()
  @IsBoolean()
  toc?: boolean;

  @IsOptional()
  @IsString()
  tocTitle?: string;
}
