import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ChatIdDto {
  @IsUUID()
  chatId: string;
}

export class UpdateChatTitleDto extends ChatIdDto {
  @IsString()
  @MaxLength(255)
  title: string;
}

export class SearchChatsDto {
  @IsString()
  @MaxLength(255)
  query: string;
}

export class SendChatMessageDto {
  @IsOptional()
  @IsUUID()
  chatId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mentionedPageIds?: string[];

  @IsOptional()
  @IsUUID()
  contextPageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
