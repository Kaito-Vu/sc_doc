import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiChatService } from './ai-chat.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { FastifyReply } from 'fastify';
import {
  ChatIdDto,
  SearchChatsDto,
  SendChatMessageDto,
  UpdateChatTitleDto,
} from './ai-chat.dto';
import { sseErrorMessage, startSse, writeSse } from '../ai/sse.util';

@UseGuards(JwtAuthGuard)
@Controller('ai/chats')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @RequireFeature(Feature.AI)
  async create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.createChat(user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  @RequireFeature(Feature.AI)
  async list(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.listChats(user, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @RequireFeature(Feature.AI)
  async info(
    @Body() body: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.getChatInfo(body.chatId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @RequireFeature(Feature.AI)
  async delete(
    @Body() body: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.aiChatService.deleteChat(body.chatId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @RequireFeature(Feature.AI)
  async update(
    @Body() body: UpdateChatTitleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.aiChatService.updateTitle(
      body.chatId,
      body.title,
      user,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  @RequireFeature(Feature.AI)
  async search(
    @Body() body: SearchChatsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.searchChats(body.query, user, workspace.id);
  }

  @Post('send')
  @RequireFeature(Feature.AI)
  async send(
    @Body() body: SendChatMessageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    startSse(res);
    try {
      await this.aiChatService.sendMessage(body, user, workspace.id, res);
    } catch (err) {
      // Nothing streamed yet: let the exception filter send a normal error
      // response. Otherwise report it in-stream; either way never leave the
      // connection open.
      if (!res.raw.headersSent) throw err;
      writeSse(res, {
        type: 'error',
        message: sseErrorMessage(err, 'Failed to send message'),
      });
    }
    res.raw.end();
  }
}
