import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../../common/decorators/require-session-auth.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { SessionGuardService } from './session-guard.service';

@UseGuards(JwtAuthGuard)
@Controller('plugins/session-guard')
export class SessionGuardController {
  constructor(private readonly sessionGuardService: SessionGuardService) {}

  @RequireSessionAuth()
  @Get('status')
  async getStatus(@Req() req: FastifyRequest) {
    const sessionId = (req.raw as any).sessionId;
    if (!sessionId) return { status: 'none' };

    return this.sessionGuardService.getStatus(sessionId);
  }

  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('conflicts/:conflictId/deny')
  async deny(
    @Param('conflictId', ParseUUIDPipe) conflictId: string,
    @Req() req: FastifyRequest,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const sessionId = (req.raw as any).sessionId;
    if (!sessionId) throw new BadRequestException('Session not found');

    const outcome = await this.sessionGuardService.resolveConflict(
      conflictId,
      'deny',
      sessionId,
      workspace.id,
    );

    return { ok: true, outcome };
  }

  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('conflicts/:conflictId/allow')
  async allow(
    @Param('conflictId', ParseUUIDPipe) conflictId: string,
    @Req() req: FastifyRequest,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const sessionId = (req.raw as any).sessionId;
    if (!sessionId) throw new BadRequestException('Session not found');

    const outcome = await this.sessionGuardService.resolveConflict(
      conflictId,
      'allow',
      sessionId,
      workspace.id,
    );

    return { ok: true, outcome };
  }
}
