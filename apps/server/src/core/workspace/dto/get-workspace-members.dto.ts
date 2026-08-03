import { IsOptional, IsString } from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class GetWorkspaceMembersDto extends PaginationOptions {
  @IsOptional()
  @IsString()
  providerId?: string;
}
