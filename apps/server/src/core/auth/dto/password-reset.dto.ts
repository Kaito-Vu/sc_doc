import { IsString, MinLength, IsOptional } from 'class-validator';

export class PasswordResetDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;
}
