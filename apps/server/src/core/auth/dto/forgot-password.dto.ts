import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;
}
