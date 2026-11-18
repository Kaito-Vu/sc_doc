import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { WsGateway } from '../../ws/ws.gateway';

@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  // Per-workspace short-lived promise cache: dedupes concurrent callers and
  // avoids a cluster-wide fetchSockets round trip on every poll.
  // ponytail: <=5s stale, per process; entries pruned on read.
  private readonly cache = new Map<string, { p: Promise<string[]>; exp: number }>();

  constructor(private readonly wsGateway: WsGateway) {}

  // Every authenticated socket joins `workspace-<id>` (see WsGateway), so the
  // users with a live socket in that room are the online ones. fetchSockets
  // also spans nodes when the redis adapter is active.
  @HttpCode(HttpStatus.OK)
  @Post('online')
  getOnlineUserIds(@AuthWorkspace() workspace: Workspace): Promise<string[]> {
    const now = Date.now();
    for (const [k, v] of this.cache) if (v.exp <= now) this.cache.delete(k);

    const hit = this.cache.get(workspace.id);
    if (hit) return hit.p;

    const p = this.wsGateway.server
      .in(`workspace-${workspace.id}`)
      .fetchSockets()
      .then((sockets) =>
        [...new Set(sockets.map((s) => s.data.userId as string))].filter(
          Boolean,
        ),
      );
    this.cache.set(workspace.id, { p, exp: now + 5000 });
    p.catch(() => this.cache.delete(workspace.id));
    return p;
  }
}
