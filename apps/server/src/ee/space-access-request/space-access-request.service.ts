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
  ) {}

  private isWorkspaceAdmin(user: User) {
    return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
  }

  // Workspace owner/admin, or Full access (admin) member of the space.
  async isApprover(user: User, spaceId: string): Promise<boolean> {
    if (this.isWorkspaceAdmin(user)) return true;
    const roles = await this.spaceMemberRepo.getUserSpaceRoles(user.id, spaceId, {
      skipCache: true,
    });
    return !!roles?.some((r) => r.role === SpaceRole.ADMIN);
  }

  async create(
    dto: { spaceId: string; role: SpaceRole; message?: string },
    user: User,
  ) {
    if (!Object.values(SpaceRole).includes(dto.role)) {
      throw new BadRequestException('Invalid role');
    }
    const space = await this.spaceRepo.findById(dto.spaceId, user.workspaceId);
    if (!space) throw new NotFoundException('Space not found');

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
    if (!Object.values(SpaceRole).includes(role)) {
      throw new BadRequestException('Invalid role');
    }
    const row = await executeTx(this.db, async (trx) => {
      const r = await this.repo.findByIdForUpdate(id, trx);
      if (!r || r.workspaceId !== user.workspaceId) {
        throw new NotFoundException('Request not found');
      }
      if (!(await this.isApprover(user, r.spaceId))) {
        throw new ForbiddenException();
      }
      if (r.status !== 'pending') {
        throw new ConflictException('Request was already handled');
      }
      const existing = await this.spaceMemberRepo.getSpaceMemberByTypeId(
        r.spaceId,
        { userId: r.requesterId },
        trx,
      );
      if (!existing) {
        await this.spaceMemberRepo.insertSpaceMember(
          {
            spaceId: r.spaceId,
            userId: r.requesterId,
            role,
            addedById: user.id,
          },
          trx,
        );
      }
      await this.repo.decide(id, trx, {
        status: 'approved',
        reviewerId: user.id,
        roleGranted: role,
      });
      return r;
    });

    // Reuses the existing "added to a space" listener (notification to requester).
    this.eventEmitter.emit(EventName.SPACE_MEMBER_ADDED, {
      userIds: [row.requesterId],
      groupIds: [],
      spaceId: row.spaceId,
      workspaceId: row.workspaceId,
      actorId: user.id,
    });
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
      changes: { after: { role, requesterId: row.requesterId } },
    });
  }

  async reject(id: string, reason: string | undefined, user: User): Promise<void> {
    const row = await executeTx(this.db, async (trx) => {
      const r = await this.repo.findByIdForUpdate(id, trx);
      if (!r || r.workspaceId !== user.workspaceId) {
        throw new NotFoundException('Request not found');
      }
      if (!(await this.isApprover(user, r.spaceId))) {
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
    return this.repo.listPending(user.workspaceId, await this.scopeFor(user), pagination);
  }

  async count(user: User): Promise<number> {
    return this.repo.countPending(user.workspaceId, await this.scopeFor(user));
  }

  // Workspace owners/admins + Full access members of the space (direct or via group).
  async getApproverIds(workspaceId: string, spaceId: string): Promise<string[]> {
    return this.repo.findApproverIds(workspaceId, spaceId);
  }
}
