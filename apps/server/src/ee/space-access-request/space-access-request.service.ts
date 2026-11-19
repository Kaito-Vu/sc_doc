import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceRole, UserRole } from '../../common/helpers/types/permission';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { EventName } from '../../common/events/event.contants';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { SpaceAccessRequestRepo, SpaceScope } from './space-access-request.repo';
import { PluginConfigService } from '../plugins/services/plugin-config.service';

export const PLUGIN_ID = 'space-access-request';

export const REREQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SpaceAccessRequestService {
  constructor(
    private readonly repo: SpaceAccessRequestRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private readonly pluginConfig: PluginConfigService,
  ) {}

  // Settings > Plugins switch (default off).
  async isEnabled(workspaceId: string): Promise<boolean> {
    try {
      return !!(await this.pluginConfig.getConfig(workspaceId, PLUGIN_ID))?.enabled;
    } catch {
      return false;
    }
  }

  private async assertEnabled(workspaceId: string): Promise<void> {
    if (!(await this.isEnabled(workspaceId))) {
      throw new ForbiddenException('Space access requests are disabled');
    }
  }

  private isWorkspaceAdmin(user: User) {
    return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
  }

  // Full access (admin) on the space. Workspace owners/admins get that role
  // implicitly for every non-personal, non-deleted space (so personal spaces stay private).
  async isApprover(user: User, spaceId: string): Promise<boolean> {
    const roles = await this.spaceMemberRepo.getUserSpaceRoles(user.id, spaceId, {
      skipCache: true,
    });
    return !!roles?.some((r) => r.role === SpaceRole.ADMIN);
  }

  async create(
    dto: { spaceId: string; role: SpaceRole; message?: string },
    user: User,
  ) {
    await this.assertEnabled(user.workspaceId);
    if (!Object.values(SpaceRole).includes(dto.role)) {
      throw new BadRequestException('Invalid role');
    }
    const space = await this.spaceRepo.findById(dto.spaceId, user.workspaceId);
    if (!space || space.deletedAt) throw new NotFoundException('Space not found');
    if (space.isPersonal) {
      throw new BadRequestException('Access to personal spaces cannot be requested');
    }

    const roles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      space.id,
      { skipCache: true },
    );
    if (roles?.length) {
      throw new BadRequestException('You already have access to this space');
    }

    const pending = await this.repo.findPendingForSpaceAndUser(space.id, user.id);
    if (pending) throw new ConflictException('A request is already pending');

    const latest = await this.repo.findLatestForSpaceAndUser(space.id, user.id);
    if (
      latest?.status === 'rejected' &&
      latest.decidedAt &&
      Date.now() - new Date(latest.decidedAt).getTime() < REREQUEST_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        'Your previous request was rejected recently. Please try again later.',
      );
    }

    let row;
    try {
      row = await this.repo.insert({
        workspaceId: user.workspaceId,
        spaceId: space.id,
        requesterId: user.id,
        roleRequested: dto.role,
        message: dto.message?.trim() || null,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('A request is already pending');
      }
      throw err;
    }

    await this.notificationQueue.add(QueueJob.SPACE_ACCESS_REQUESTED, {
      requestId: row.id,
      spaceId: space.id,
      workspaceId: user.workspaceId,
    });
    this.auditService.log({
      event: AuditEvent.SPACE_ACCESS_REQUESTED,
      resourceType: AuditResource.SPACE,
      resourceId: space.id,
      spaceId: space.id,
      changes: { after: { role: dto.role } },
    });
    return row;
  }

  // Pre-request lookup for the 403 screen. Unknown slug -> `space: null`.
  async info(spaceSlug: string, user: User) {
    if (!(await this.isEnabled(user.workspaceId))) {
      return { space: null, request: null, canRequest: false };
    }
    const space = await this.spaceRepo.findBySlug(spaceSlug, user.workspaceId);
    if (!space || space.deletedAt || space.isPersonal) {
      return { space: null, request: null, canRequest: false };
    }

    const roles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      space.id,
      { skipCache: true },
    );
    const latest = await this.repo.findLatestForSpaceAndUser(space.id, user.id);
    const coolingDown =
      latest?.status === 'rejected' &&
      !!latest.decidedAt &&
      Date.now() - new Date(latest.decidedAt).getTime() < REREQUEST_COOLDOWN_MS;

    return {
      space: { id: space.id, name: space.name, slug: space.slug },
      request: latest
        ? {
            id: latest.id,
            status: latest.status,
            roleRequested: latest.roleRequested,
            roleGranted: latest.roleGranted,
            decisionReason: latest.decisionReason,
            createdAt: latest.createdAt,
          }
        : null,
      canRequest:
        !roles?.length && latest?.status !== 'pending' && !coolingDown,
    };
  }

  async cancel(id: string, user: User): Promise<void> {
    const row = await executeTx(this.db, async (trx) => {
      const r = await this.repo.findByIdForUpdate(id, trx);
      if (!r || r.requesterId !== user.id) {
        throw new NotFoundException('Request not found');
      }
      if (r.status !== 'pending') {
        throw new ConflictException('Request is no longer pending');
      }
      await this.repo.decide(id, trx, { status: 'cancelled' });
      return r;
    });
    await this.notificationQueue.add(QueueJob.SPACE_ACCESS_DECIDED, {
      requestId: row.id,
      spaceId: row.spaceId,
      workspaceId: row.workspaceId,
    });
    this.auditService.log({
      event: AuditEvent.SPACE_ACCESS_CANCELLED,
      resourceType: AuditResource.SPACE,
      resourceId: row.spaceId,
      spaceId: row.spaceId,
    });
  }

  async approve(id: string, role: SpaceRole, user: User): Promise<void> {
    await this.assertEnabled(user.workspaceId);
    if (!Object.values(SpaceRole).includes(role)) {
      throw new BadRequestException('Invalid role');
    }
    const row = await executeTx(this.db, async (trx) => {
      const r = await this.repo.findByIdForUpdate(id, trx);
      if (!r || r.workspaceId !== user.workspaceId) {
        throw new NotFoundException('Request not found');
      }
      if (!(await this.isApprover(user, r.spaceId)) || r.requesterId === user.id) {
        throw new ForbiddenException();
      }
      if (r.status !== 'pending') {
        throw new ConflictException('Request was already handled');
      }
      if (!(await this.repo.isActiveUser(r.requesterId, r.workspaceId, trx))) {
        throw new ConflictException('Requester is no longer an active user');
      }
      const existing = await this.spaceMemberRepo.getSpaceMemberByTypeId(
        r.spaceId,
        { userId: r.requesterId },
        trx,
      );
      if (!existing) {
        try {
          await this.spaceMemberRepo.insertSpaceMember(
            {
              spaceId: r.spaceId,
              userId: r.requesterId,
              role,
              addedById: user.id,
            },
            trx,
          );
        } catch (err: any) {
          // concurrent add through the regular member API
          if (err?.code === '23505') {
            throw new ConflictException('User is already a member');
          }
          throw err;
        }
      }
      // Already a member: keep their real role, report it truthfully.
      const granted = existing?.role ?? role;
      await this.repo.decide(id, trx, {
        status: 'approved',
        reviewerId: user.id,
        roleGranted: granted,
      });
      return { ...r, granted, added: !existing };
    });

    if (row.added) {
      // Reuses the existing "added to a space" listener (notification to requester).
      this.eventEmitter.emit(EventName.SPACE_MEMBER_ADDED, {
        userIds: [row.requesterId],
        groupIds: [],
        spaceId: row.spaceId,
        workspaceId: row.workspaceId,
        actorId: user.id,
      });
    }
    await this.notificationQueue.add(QueueJob.SPACE_ACCESS_DECIDED, {
      requestId: row.id,
      spaceId: row.spaceId,
      workspaceId: row.workspaceId,
    });
    this.auditService.log({
      event: AuditEvent.SPACE_ACCESS_APPROVED,
      resourceType: AuditResource.SPACE,
      resourceId: row.spaceId,
      spaceId: row.spaceId,
      changes: { after: { role: row.granted, requesterId: row.requesterId } },
    });
  }

  async reject(id: string, reason: string | undefined, user: User): Promise<void> {
    await this.assertEnabled(user.workspaceId);
    const row = await executeTx(this.db, async (trx) => {
      const r = await this.repo.findByIdForUpdate(id, trx);
      if (!r || r.workspaceId !== user.workspaceId) {
        throw new NotFoundException('Request not found');
      }
      if (!(await this.isApprover(user, r.spaceId)) || r.requesterId === user.id) {
        throw new ForbiddenException();
      }
      if (r.status !== 'pending') {
        throw new ConflictException('Request was already handled');
      }
      await this.repo.decide(id, trx, {
        status: 'rejected',
        reviewerId: user.id,
        decisionReason: reason?.trim() || undefined,
      });
      return r;
    });
    await this.notificationQueue.add(QueueJob.SPACE_ACCESS_DECIDED, {
      requestId: row.id,
      spaceId: row.spaceId,
      workspaceId: row.workspaceId,
    });
    this.auditService.log({
      event: AuditEvent.SPACE_ACCESS_REJECTED,
      resourceType: AuditResource.SPACE,
      resourceId: row.spaceId,
      spaceId: row.spaceId,
      changes: { after: { requesterId: row.requesterId } },
    });
  }

  private async scopeFor(user: User): Promise<SpaceScope> {
    if (this.isWorkspaceAdmin(user)) return 'all';
    return this.repo.findAdminSpaceIds(user.id, user.workspaceId);
  }

  async list(user: User, pagination: PaginationOptions) {
    if (!(await this.isEnabled(user.workspaceId))) {
      return {
        items: [],
        meta: { limit: pagination.limit, hasNextPage: false, hasPrevPage: false, nextCursor: null, prevCursor: null },
      };
    }
    return this.repo.listPending(user.workspaceId, await this.scopeFor(user), pagination);
  }

  async count(user: User): Promise<number> {
    if (!(await this.isEnabled(user.workspaceId))) return 0;
    return this.repo.countPending(user.workspaceId, await this.scopeFor(user));
  }

  // Workspace owners/admins + Full access members of the space (direct or via group).
  async getApproverIds(workspaceId: string, spaceId: string): Promise<string[]> {
    return this.repo.findApproverIds(workspaceId, spaceId);
  }
}
