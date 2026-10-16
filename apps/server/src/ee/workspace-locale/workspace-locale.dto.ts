import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { SUPPORTED_LOCALES } from './locales';

export class UpdateWorkspaceLocaleDto {
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: string;

  @IsOptional()
  @IsBoolean()
  forceLocale?: boolean;
}
