import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientLogDto {
  @IsIn(['warn', 'error'])
  level: 'warn' | 'error';

  @IsString()
  @MaxLength(200)
  context: string;

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}
