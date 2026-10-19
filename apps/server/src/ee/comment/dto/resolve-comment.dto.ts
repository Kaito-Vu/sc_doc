import { IsBoolean, IsUUID } from 'class-validator';

export class ResolveCommentDto {
  @IsUUID()
  commentId: string;

  @IsUUID()
  pageId: string;

  @IsBoolean()
  resolved: boolean;
}
