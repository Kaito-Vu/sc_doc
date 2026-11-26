import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // Parsed and range-checked by ApiKeyService.create; "" means no expiry.
  @IsOptional()
  @IsString()
  expiresAt?: string;

  // Omitted = DB default (read + write).
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['read', 'write'], { each: true })
  scopes?: Array<'read' | 'write'>;
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class ApiKeyIdDto {
  @IsUUID()
  apiKeyId: string;
}
