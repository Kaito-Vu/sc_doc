import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../../../common/events/event.contants';
import { getPageTitle } from '../../../common/helpers';
import { DomainService } from '../../../integrations/environment/domain.service';
import { NotificationRecipientsRepo } from '../notification-recipients.repo';
import { NotificationRecipientResolver } from '../notification-recipient.resolver';
import { NotificationDispatcher } from '../notification-dispatcher.service';
import {
  EeNotificationType,
  MAX_PAGE_LIFECYCLE_FANOUT,
  PAGE_LIFECYCLE_COOLDOWN_HOURS,
} from '../notification.constants';
import {
  EmailContent,
  EePageContext,
  NotificationUser,
  PageIdsEvent,
  PageMovedEvent,
} from '../notification.types';
import { PageLifecycleEmail } from '../emails/page-lifecycle-email';

@Injectable()
export class PageLifecycleNotificationListener {
  private readonly logger = new Logger(PageLifecycleNotificationListener.name);

  constructor(
    private readonly recipientsRepo: NotificationRecipientsRepo,
    private readonly recipientResolver: NotificationRecipientResolver,
    private readonly dispatcher: NotificationDispatcher,
    private readonly domainService: DomainService,
  ) {}

  @OnEvent(EventName.PAGE_CREATED)
  async handlePageCreated(event: PageIdsEvent): Promise<void> {
    await this.safe('page.created', () =>
      this.handleLifecycleEvent(event, EeNotificationType.PAGE_CREATED),
    );
  }

  @OnEvent(EventName.PAGE_SOFT_DELETED)
  async handlePageTrashed(event: PageIdsEvent): Promise<void> {
    await this.safe('page.trashed', () =>
      this.handleLifecycleEvent(event, EeNotificationType.PAGE_TRASHED),
    );
  }

  @OnEvent(EventName.PAGE_RESTORED)
  async handlePageRestored(event: PageIdsEvent): Promise<void> {
    await this.safe('page.restored', () =>
      this.handleLifecycleEvent(event, EeNotificationType.PAGE_RESTORED),
    );
  }

  @OnEvent(EventName.PAGE_MOVED_TO_SPACE)
  async handlePageMoved(event: PageMovedEvent): Promise<void> {
    await this.safe('page.moved', () => this.handlePageMovedEvent(event));
  }

  private async handlePageMovedEvent(event: PageMovedEvent): Promise<void> {
    const contexts = await this.loadRootContexts(event.pageIds, 'move');
    if (contexts.length === 0) return;

    const appUrl = await this.getWorkspaceUrl(event.workspaceId);
    const actorNames = await this.recipientsRepo.findUserNames(
      event.actorId ? [event.actorId] : [],
    );
    const actorName = event.actorId
      ? (actorNames.get(event.actorId) ?? 'Someone')
      : 'Someone';

    for (const context of contexts) {
      await this.dispatchForPage(
        context,
        appUrl,
        actorName,
        event.actorId ?? null,
        EeNotificationType.PAGE_MOVED,
        PAGE_LIFECYCLE_COOLDOWN_HOURS,
      );
    }
  }

  private async handleLifecycleEvent(
    event: PageIdsEvent,
    type: EeNotificationType,
  ): Promise<void> {
    const contexts = await this.loadRootContexts(event.pageIds, type);
    if (contexts.length === 0) return;

    const appUrl = await this.getWorkspaceUrl(event.workspaceId);
    const actorIds = contexts
      .map((context) => this.getActorId(context, type))
      .filter((id): id is string => !!id);
    const actorNames = await this.recipientsRepo.findUserNames(actorIds);

    for (const context of contexts) {
      const actorId = this.getActorId(context, type);
      const actorName = actorId
        ? (actorNames.get(actorId) ?? 'Someone')
        : 'Someone';
      await this.dispatchForPage(
        context,
        appUrl,
        actorName,
        actorId,
        type,
        PAGE_LIFECYCLE_COOLDOWN_HOURS,
      );
    }
  }

  /**
   * Trash/restore/move events list every descendant; only the subtree root is
   * worth a notification. The fan-out cap applies to roots (bulk imports).
   */
  private async loadRootContexts(
    pageIds: string[] | undefined,
    label: string,
  ): Promise<EePageContext[]> {
    if (!pageIds?.length) return [];

    const all = await this.recipientsRepo.findPageContexts(pageIds);
    const ids = new Set(pageIds);
    const roots = all.filter(
      (context) => !context.parentPageId || !ids.has(context.parentPageId),
    );
    if (roots.length > MAX_PAGE_LIFECYCLE_FANOUT) {
      this.logger.debug(`Skipping ${label} notifications for ${roots.length} pages`);
      return [];
    }
    return roots;
  }

  private async dispatchForPage(
    context: EePageContext,
    appUrl: string,
    actorName: string,
    actorId: string | null,
    type: EeNotificationType,
    cooldownHours: number,
  ): Promise<void> {
    const recipients = await this.recipientResolver.resolvePageRecipients({
      pageId: context.id,
      spaceId: context.spaceId,
      actorIds: actorId ? [actorId] : [],
      includeWatchers: true,
      includeExplicitPermission: true,
      includeVerifiers: true,
      excludeConnected: false,
    });

    if (recipients.length === 0) return;

    const pageTitle = getPageTitle(context.title);
    const spaceName = context.spaceName ?? context.spaceSlug;
    const pageUrl = this.buildPageUrl(appUrl, context);

    await this.dispatcher.dispatch({
      userIds: recipients,
      type,
      workspaceId: context.workspaceId,
      actorId,
      pageId: context.id,
      spaceId: context.spaceId,
      cooldownHours,
      email: this.buildEmail(
        type,
        actorName,
        pageTitle,
        spaceName,
        pageUrl,
      ),
    });
  }

  private buildEmail(
    type: EeNotificationType,
    actorName: string,
    pageTitle: string,
    spaceName: string,
    pageUrl: string,
  ): ((user: NotificationUser) => EmailContent) | null {
    switch (type) {
      case EeNotificationType.PAGE_CREATED:
        return (user) => ({
          subject: `${actorName} created "${pageTitle}"`,
          template: PageLifecycleEmail({
            userName: user.name,
            message: `${actorName} created "${pageTitle}" in the ${spaceName} space.`,
            pageUrl,
          }),
        });
      case EeNotificationType.PAGE_RESTORED:
        return (user) => ({
          subject: `"${pageTitle}" was restored`,
          template: PageLifecycleEmail({
            userName: user.name,
            message: `"${pageTitle}" in the ${spaceName} space was restored.`,
            pageUrl,
          }),
        });
      case EeNotificationType.PAGE_MOVED:
        return (user) => ({
          subject: `"${pageTitle}" was moved to the ${spaceName} space`,
          template: PageLifecycleEmail({
            userName: user.name,
            message: `"${pageTitle}" was moved to the ${spaceName} space.`,
            pageUrl,
          }),
        });
      case EeNotificationType.PAGE_TRASHED:
        // A trashed page has no reachable URL; keep this in-app only.
        return null;
      default:
        return null;
    }
  }

  private getActorId(
    context: EePageContext,
    type: EeNotificationType,
  ): string | null {
    if (type === EeNotificationType.PAGE_TRASHED) {
      return context.deletedById;
    }
    if (type === EeNotificationType.PAGE_CREATED) {
      return context.creatorId;
    }
    return null;
  }

  private buildPageUrl(appUrl: string, context: EePageContext): string {
    return `${appUrl}/s/${context.spaceSlug}/p/${context.slugId}`;
  }

  private async getWorkspaceUrl(workspaceId: string): Promise<string> {
    const hostname =
      await this.recipientsRepo.findWorkspaceHostname(workspaceId);
    return this.domainService.getUrl(hostname);
  }

  private async safe(
    eventName: string,
    handler: () => Promise<void>,
  ): Promise<void> {
    try {
      await handler();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to process ${eventName} notification: ${message}`);
    }
  }
}
