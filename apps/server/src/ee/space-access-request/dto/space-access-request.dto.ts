import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SpaceRole } from '../../../common/helpers/types/permission';

export class InfoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  spaceSlug: string;
}

export class CreateRequestDto {
  @IsUUID()
  spaceId: string;

  @IsEnum(SpaceRole)
  role: SpaceRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class RequestIdDto {
  @IsUUID()
  id: string;
}

export class ApproveRequestDto extends RequestIdDto {
  @IsEnum(SpaceRole)
  role: SpaceRole;
}

export class RejectRequestDto extends RequestIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
