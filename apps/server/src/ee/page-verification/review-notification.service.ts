import { Injectable } from '@nestjs/common';
import {
  IApprovalClarificationNotificationJob,
  IPageReverificationRequiredNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import { NotificationType } from '../../core/notification/notification.constants';
import { ApprovalClarificationEmail } from '../../integrations/transactional/emails/approval-clarification-email';
import { ReverificationRequiredEmail } from '../../integrations/transactional/emails/reverification-required-email';
import { getPageTitle } from '../../common/helpers';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient.resolver';
import { NotificationRecipientsRepo } from '../notifications/notification-recipients.repo';

@Injectable()
export class ReviewNotificationService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly resolver: NotificationRecipientResolver,
    private readonly recipientsRepo: NotificationRecipientsRepo,
  ) {}

  async processApprovalClarification(
    data: IApprovalClarificationNotificationJob,
    appUrl: string,
  ) {
    const { pageId, spaceId, workspaceId, actorId, requestedById } = data;

    const recipients = await this.resolver.filterPageAccessible(
      [requestedById],
      pageId,
      spaceId,
    );
    if (recipients.length === 0) return;

    const context = await this.getPageContext(pageId, appUrl);
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;
    const actorName =
      (await this.recipientsRepo.findUserNames([actorId])).get(actorId) ??
      'Someone';

    await this.dispatcher.dispatch({
      userIds: recipients,
      workspaceId,
      type: NotificationType.PAGE_APPROVAL_CLARIFICATION_REQUESTED,
      actorId,
      pageId,
      spaceId,
      email: () => ({
        subject: `Clarification requested on "${pageTitle}"`,
        template: ApprovalClarificationEmail({
          actorName,
          pageTitle,
          spaceName,
          pageUrl: basePageUrl,
        }),
      }),
    });
  }

  async processReverificationRequired(
    data: IPageReverificationRequiredNotificationJob,
    appUrl: string,
  ) {
    const { pageId, spaceId, workspaceId, verifierIds } = data;
    if (verifierIds.length === 0) return;

    const recipients = await this.resolver.filterPageAccessible(
      verifierIds,
      pageId,
      spaceId,
    );
    if (recipients.length === 0) return;

    const context = await this.getPageContext(pageId, appUrl);
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;

    await this.dispatcher.dispatch({
      userIds: recipients,
      workspaceId,
      type: NotificationType.PAGE_REVERIFICATION_REQUIRED,
      pageId,
      spaceId,
      email: () => ({
        subject: `"${pageTitle}" needs to be re-verified`,
        template: ReverificationRequiredEmail({
          pageTitle,
          spaceName,
          pageUrl: basePageUrl,
        }),
      }),
    });
  }

  private async getPageContext(pageId: string, appUrl: string) {
    const [page] = await this.recipientsRepo.findPageContexts([pageId]);
    if (!page) return null;

    return {
      pageTitle: getPageTitle(page.title),
      spaceName: page.spaceName ?? page.spaceSlug,
      basePageUrl: `${appUrl}/s/${page.spaceSlug}/p/${page.slugId}`,
    };
  }
}
