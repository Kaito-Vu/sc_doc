import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateMailSettingsDto {
  @IsEmail()
  fromAddress: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsString()
  @IsNotEmpty()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsOptional()
  @IsString()
  username?: string;

  // undefined = keep the stored password, null = remove it
  @IsOptional()
  @IsString()
  password?: string | null;

  @IsBoolean()
  secure: boolean;

  @IsBoolean()
  ignoreTLS: boolean;
}

export class TestMailSettingsDto {
  @IsEmail()
  to: string;
}
