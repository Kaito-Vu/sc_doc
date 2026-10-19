import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiChatRepo } from './ai-chat.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { FastifyReply } from 'fastify';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../integrations/storage/storage.service';
import {
  getAttachmentFolderPath,
  prepareFile,
} from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { createByteCountingStream } from '../../common/helpers/utils';
import { v7 as uuid7 } from 'uuid';
import { MultipartFile } from '@fastify/multipart';
import { writeSse } from '../ai/sse.util';

@Injectable()
export class AiChatService {
  constructor(
    private readonly aiChatRepo: AiChatRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storageService: StorageService,
  ) {}

  private async assertAiChatEnabled(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = (workspace?.settings ?? {}) as Record<string, any>;
    if (!settings?.ai?.chatEnabled) {
      throw new ForbiddenException('AI chat is not enabled');
    }
  }

  private async getOwnedChat(
    chatId: string,
    user: User,
    workspaceId: string,
  ) {
    const chat = await this.aiChatRepo.findById(chatId, workspaceId, user.id);
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }

  private mapChat(chat: any) {
    return {
      ...chat,
      createdAt: chat.createdAt?.toISOString?.() ?? chat.createdAt,
      updatedAt: chat.updatedAt?.toISOString?.() ?? chat.updatedAt,
    };
  }

  private mapMessage(msg: any) {
    return {
      id: msg.id,
      chatId: msg.chatId,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      metadata: msg.metadata,
      createdAt: msg.createdAt?.toISOString?.() ?? msg.createdAt,
    };
  }

  async createChat(user: User, workspaceId: string) {
    await this.assertAiChatEnabled(workspaceId);
    const chat = await this.aiChatRepo.createChat(workspaceId, user.id);
    return this.mapChat(chat);
  }

  async listChats(
    user: User,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    await this.assertAiChatEnabled(workspaceId);
    const result = await this.aiChatRepo.listChats(
      workspaceId,
      user.id,
      pagination,
    );
    return { ...result, items: result.items.map((c) => this.mapChat(c)) };
  }

  async getChatInfo(chatId: string, user: User, workspaceId: string) {
    await this.assertAiChatEnabled(workspaceId);
    const chat = await this.getOwnedChat(chatId, user, workspaceId);
    const messages = await this.aiChatRepo.getMessages(chatId);
    return {
      chat: this.mapChat(chat),
      messages: messages.map((m) => this.mapMessage(m)),
    };
  }

  async deleteChat(chatId: string, user: User, workspaceId: string) {
    await this.assertAiChatEnabled(workspaceId);
    await this.getOwnedChat(chatId, user, workspaceId);
    await this.aiChatRepo.softDelete(chatId);
  }

  async updateTitle(
    chatId: string,
    title: string,
    user: User,
    workspaceId: string,
  ) {
    await this.assertAiChatEnabled(workspaceId);
    await this.getOwnedChat(chatId, user, workspaceId);
    await this.aiChatRepo.updateTitle(chatId, title);
  }

  async searchChats(query: string, user: User, workspaceId: string) {
    await this.assertAiChatEnabled(workspaceId);
    const chats = await this.aiChatRepo.searchChats(
      workspaceId,
      user.id,
      query,
    );
    return chats.map((c) => this.mapChat(c));
  }

  async sendMessage(
    data: {
      chatId?: string;
      content: string;
    },
    user: User,
    workspaceId: string,
    res: FastifyReply,
  ) {
    await this.assertAiChatEnabled(workspaceId);

    // NOTE: mentionedPageIds / contextPageId / attachmentIds are accepted
    // but unused by this stub. When an LLM is wired in, every page/attachment
    // must be permission-checked for `user` before its content reaches the
    // prompt (page-level restrictions included), or chat becomes a data leak.
    let chatId = data.chatId;
    if (!chatId) {
      const chat = await this.aiChatRepo.createChat(workspaceId, user.id);
      chatId = chat.id;
      writeSse(res, { type: 'chat_created', chatId });
    } else {
      await this.getOwnedChat(chatId, user, workspaceId);
    }

    await this.aiChatRepo.insertMessage({
      chatId,
      workspaceId,
      userId: user.id,
      role: 'user',
      content: data.content,
    });

    const assistantText =
      'AI chat is enabled but no LLM provider is configured. Configure your AI settings in workspace settings.';

    const assistantMsg = await this.aiChatRepo.insertMessage({
      chatId,
      workspaceId,
      role: 'assistant',
      content: assistantText,
    });

    await this.aiChatRepo.touchChat(chatId);

    if (!data.chatId) {
      await this.aiChatRepo.updateTitle(
        chatId,
        data.content.slice(0, 80) || 'New chat',
      );
    }

    writeSse(res, { type: 'content', text: assistantText });
    writeSse(res, { type: 'done', messageId: assistantMsg.id });
    writeSse(res, '[DONE]');
  }

  async uploadFile(
    file: MultipartFile,
    user: User,
    workspaceId: string,
    chatId?: string,
  ) {
    await this.assertAiChatEnabled(workspaceId);
    // Attachments may only be linked to the caller's own chat.
    if (chatId) await this.getOwnedChat(chatId, user, workspaceId);
    const prepared = await prepareFile(Promise.resolve(file), {
      skipBuffer: true,
    });
    const attachmentId = uuid7();
    const filePath = `${getAttachmentFolderPath(AttachmentType.Chat, workspaceId)}/${attachmentId}/${prepared.fileName}`;
    const { stream, getBytesRead } = createByteCountingStream(
      prepared.multiPartFile.file,
    );
    await this.storageService.upload(filePath, stream);
    prepared.fileSize = getBytesRead();

    await this.attachmentRepo.insertAttachment({
      id: attachmentId,
      type: AttachmentType.Chat,
      filePath,
      fileName: prepared.fileName,
      fileSize: prepared.fileSize,
      mimeType: prepared.mimeType,
      fileExt: prepared.fileExtension,
      creatorId: user.id,
      workspaceId,
      aiChatId: chatId ?? null,
    });

    if (chatId) {
      await this.attachmentRepo.claimAttachmentsForChat(
        [attachmentId],
        chatId,
        user.id,
        workspaceId,
      );
    }

    return {
      id: attachmentId,
      fileName: prepared.fileName,
      fileExt: prepared.fileExtension,
      fileSize: prepared.fileSize,
      mimeType: prepared.mimeType,
    };
  }
}
