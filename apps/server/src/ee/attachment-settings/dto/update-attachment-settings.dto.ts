import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

// For every field: undefined = keep, null = reset to default.
export class UpdateAttachmentSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUploadBytes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalRtfBytes?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedExtensions?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMimeTypes?: string[] | null;
}
