import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { WsGateway } from '../../ws/ws.gateway';

@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly wsGateway: WsGateway) {}

  // Every authenticated socket joins `workspace-<id>` (see WsGateway), so the
  // users with a live socket in that room are the online ones. fetchSockets
  // also spans nodes when the redis adapter is active.
  @HttpCode(HttpStatus.OK)
  @Post('online')
  async getOnlineUserIds(@AuthWorkspace() workspace: Workspace) {
    const sockets = await this.wsGateway.server
      .in(`workspace-${workspace.id}`)
      .fetchSockets();
    return [...new Set(sockets.map((s) => s.data.userId as string))].filter(
      Boolean,
    );
  }
}
