import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationService } from '../../core/notification/notification.service';
import { NotificationType } from '../../core/notification/notification.constants';
import { SpaceAccessRequestRepo } from './space-access-request.repo';
import { SpaceAccessRequestService } from './space-access-request.service';

export type SpaceAccessJob = {
  requestId: string;
  spaceId: string;
  workspaceId: string;
};

@Injectable()
export class SpaceAccessRequestNotification {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
    private readonly repo: SpaceAccessRequestRepo,
    private readonly service: SpaceAccessRequestService,
  ) {}

  // One in-app notification per approver (never the requester).
  async processRequested(job: SpaceAccessJob): Promise<void> {
    const request = await this.repo.findById(job.requestId);
    if (!request || request.status !== 'pending') return;

    const approverIds = await this.service.getApproverIds(
      request.workspaceId,
      request.spaceId,
    );
    for (const userId of approverIds) {
      if (userId === request.requesterId) continue;
      await this.notificationService.create({
        userId,
        workspaceId: request.workspaceId,
        type: NotificationType.SPACE_ACCESS_REQUESTED,
        actorId: request.requesterId,
        spaceId: request.spaceId,
        data: {
          requestId: request.id,
          role: request.roleRequested,
          message: request.message,
        },
      });
    }
  }

  // Clears the approvers' pending notifications; tells the requester on reject.
  // Approval needs no extra notice: the existing "added to a space" listener
  // already notifies the requester when the member row is created.
  async processDecided(job: SpaceAccessJob): Promise<void> {
    const request = await this.repo.findById(job.requestId);
    if (!request || request.status === 'pending') return;

    await this.db
      .deleteFrom('notifications')
      .where('type', '=', NotificationType.SPACE_ACCESS_REQUESTED)
      .where(sql<string>`data->>'requestId'`, '=', request.id)
      .execute();

    if (request.status !== 'rejected') return;
    await this.notificationService.create({
      userId: request.requesterId,
      workspaceId: request.workspaceId,
      type: NotificationType.SPACE_ACCESS_DECIDED,
      actorId: request.reviewerId,
      spaceId: request.spaceId,
      data: {
        requestId: request.id,
        status: request.status,
        reason: request.decisionReason,
      },
    });
  }
}
