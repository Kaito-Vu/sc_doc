import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AiAction } from './ai.types';

export class AiGenerateDto {
  @IsOptional()
  @IsEnum(AiAction)
  action?: AiAction;

  @IsString()
  @MaxLength(100_000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  prompt?: string;
}
