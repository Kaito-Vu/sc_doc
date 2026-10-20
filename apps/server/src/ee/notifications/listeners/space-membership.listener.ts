import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../../../common/events/event.contants';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { DomainService } from '../../../integrations/environment/domain.service';
import { safeHandle, workspaceUrl } from './listener-helpers';
import { NotificationRecipientsRepo } from '../notification-recipients.repo';
import { NotificationDispatcher } from '../notification-dispatcher.service';
import {
  EeNotificationType,
} from '../notification.constants';
import { SpaceMemberEvent } from '../notification.types';
import { SpaceMemberAddedEmail } from '../emails/space-member-added-email';
import { PageLifecycleEmail } from '../emails/page-lifecycle-email';

@Injectable()
export class SpaceMembershipNotificationListener {
  private readonly logger = new Logger(SpaceMembershipNotificationListener.name);

  constructor(
    private readonly recipientsRepo: NotificationRecipientsRepo,
    private readonly dispatcher: NotificationDispatcher,
    private readonly domainService: DomainService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  @OnEvent(EventName.SPACE_MEMBER_ADDED)
  async handleMemberAdded(event: SpaceMemberEvent): Promise<void> {
    await safeHandle(this.logger, 'space.member_added', () =>
      this.handleMemberAddedEvent(event),
    );
  }

  private async handleMemberAddedEvent(
    event: SpaceMemberEvent,
  ): Promise<void> {
    const userIds = await this.resolveUserIds(event);
    if (userIds.length === 0) return;

    const space = await this.recipientsRepo.findSpaceContext(event.spaceId);
    if (!space) return;

    const appUrl = await workspaceUrl(this.recipientsRepo, this.domainService, event.workspaceId);
    const actorName = event.actorId
      ? await this.getActorName(event.actorId)
      : 'Someone';
    const spaceName = space.name ?? space.slug;
    const spaceUrl = `${appUrl}/s/${space.slug}`;

    await this.dispatcher.dispatch({
      userIds,
      type: EeNotificationType.SPACE_MEMBER_ADDED,
      workspaceId: event.workspaceId,
      actorId: event.actorId ?? null,
      spaceId: event.spaceId,
      data: {
        spaceId: event.spaceId,
        spaceName,
        spaceSlug: space.slug,
      },
      email: (user) => ({
        subject: `${actorName} added you to the ${spaceName} space`,
        template: SpaceMemberAddedEmail({
          userName: user.name,
          actorName,
          spaceName,
          spaceUrl,
        }),
      }),
    });
  }

  @OnEvent(EventName.SPACE_MEMBER_REMOVED)
  async handleMemberRemoved(event: SpaceMemberEvent): Promise<void> {
    await safeHandle(this.logger, 'space.member_removed', () =>
      this.handleMemberRemovedEvent(event),
    );
  }

  private async handleMemberRemovedEvent(
    event: SpaceMemberEvent,
  ): Promise<void> {
    const candidates = await this.resolveUserIds(event);
    // Removing a group (or one of several memberships) may leave users with access.
    const stillHaveAccess = candidates.length
      ? await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
          candidates,
          event.spaceId,
        )
      : new Set<string>();
    const userIds = candidates.filter((id) => !stillHaveAccess.has(id));
    if (userIds.length === 0) return;

    const space = await this.recipientsRepo.findSpaceContext(event.spaceId);
    if (!space) return;

    const appUrl = await workspaceUrl(this.recipientsRepo, this.domainService, event.workspaceId);
    const spaceName = space.name ?? space.slug;

    // The removed user no longer has space access. Store the space id in
    // `data` (not the notification's spaceId) so the row stays visible.
    await this.dispatcher.dispatch({
      userIds,
      type: EeNotificationType.SPACE_MEMBER_REMOVED,
      workspaceId: event.workspaceId,
      actorId: event.actorId ?? null,
      spaceId: null,
      data: {
        spaceId: event.spaceId,
        spaceName,
        spaceSlug: space.slug,
      },
      email: (user) => ({
        subject: `You were removed from the ${spaceName} space`,
        template: PageLifecycleEmail({
          userName: user.name,
          message: `You were removed from the ${spaceName} space.`,
          pageUrl: appUrl,
          ctaLabel: 'Open workspace',
        }),
      }),
    });
  }

  private async resolveUserIds(event: SpaceMemberEvent): Promise<string[]> {
    const groupUserIds = await this.recipientsRepo.findUserIdsByGroupIds(
      event.groupIds ?? [],
    );

    return [
      ...new Set(
        [...(event.userIds ?? []), ...groupUserIds].filter(
          (id) => id && id !== event.actorId,
        ),
      ),
    ];
  }

  private async getActorName(actorId: string): Promise<string> {
    const names = await this.recipientsRepo.findUserNames([actorId]);
    return names.get(actorId) ?? 'Someone';
  }


}
