import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UserHandleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  handle: string;
}
