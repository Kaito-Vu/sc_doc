import { Injectable } from '@nestjs/common';
import { getPageTitle } from '../../common/helpers';
import { NotificationType } from '../../core/notification/notification.constants';
import { IPageEditSupplementJob } from '../../integrations/queue/constants/queue.interface';
import { NotificationRecipientsRepo } from './notification-recipients.repo';
import { NotificationRecipientResolver } from './notification-recipient.resolver';
import { NotificationDispatcher } from './notification-dispatcher.service';
import {
  PAGE_EDIT_SUPPLEMENT_COOLDOWN_HOURS,
} from './notification.constants';
import { PageLifecycleEmail } from './emails/page-lifecycle-email';

/**
 * The core page-update job already notifies watchers. This supplement covers
 * users who were explicitly granted access to the page (or are verifiers) but
 * do not watch it, so an edit never goes unnoticed.
 */
@Injectable()
export class PageEditSupplementService {
  constructor(
    private readonly recipientsRepo: NotificationRecipientsRepo,
    private readonly recipientResolver: NotificationRecipientResolver,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async process(data: IPageEditSupplementJob, appUrl: string): Promise<void> {
    const actorIds = data.actorIds?.filter(Boolean) ?? [];
    if (actorIds.length === 0) return;

    const [context] = await this.recipientsRepo.findPageContexts([data.pageId]);
    if (!context) return;

    const actorNames = await this.recipientsRepo.findUserNames(actorIds);
    const actorName = actorNames.get(actorIds[0]) ?? 'Someone';

    const recipients = await this.recipientResolver.resolvePageRecipients({
      pageId: data.pageId,
      spaceId: data.spaceId,
      actorIds,
      includeWatchers: false,
      excludeWatchers: true,
      includeExplicitPermission: true,
      includeVerifiers: true,
      excludeConnected: true,
    });
    if (recipients.length === 0) return;

    const pageTitle = getPageTitle(context.title);
    const spaceName = context.spaceName ?? context.spaceSlug;
    const pageUrl = `${appUrl}/s/${context.spaceSlug}/p/${context.slugId}`;

    await this.dispatcher.dispatch({
      userIds: recipients,
      type: NotificationType.PAGE_UPDATED,
      workspaceId: data.workspaceId,
      actorId: actorIds[0],
      pageId: context.id,
      spaceId: context.spaceId,
      cooldownHours: PAGE_EDIT_SUPPLEMENT_COOLDOWN_HOURS,
      email: (user) => ({
        subject: `${actorName} updated "${pageTitle}"`,
        template: PageLifecycleEmail({
          userName: user.name,
          message: `${actorName} updated "${pageTitle}" in the ${spaceName} space.`,
          pageUrl,
        }),
      }),
    });
  }
}
