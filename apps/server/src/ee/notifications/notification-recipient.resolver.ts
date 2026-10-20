import { Injectable, Logger } from '@nestjs/common';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { NotificationRecipientsRepo } from './notification-recipients.repo';

export interface PageRecipientOptions {
  pageId: string;
  spaceId: string;
  actorIds?: string[];
  includeWatchers?: boolean;
  excludeWatchers?: boolean;
  includeExplicitPermission?: boolean;
  includeVerifiers?: boolean;
  excludeConnected?: boolean;
}

@Injectable()
export class NotificationRecipientResolver {
  private readonly logger = new Logger(NotificationRecipientResolver.name);

  constructor(
    private readonly watcherRepo: WatcherRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly recipientsRepo: NotificationRecipientsRepo,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  async resolvePageRecipients(
    options: PageRecipientOptions,
  ): Promise<string[]> {
    const {
      pageId,
      spaceId,
      actorIds = [],
      includeWatchers = true,
      excludeWatchers = false,
      includeExplicitPermission = true,
      includeVerifiers = false,
      excludeConnected = false,
    } = options;

    const candidates = new Set<string>();
    const watcherIds = await this.watcherRepo.getPageUpdateRecipientIds(
      pageId,
      spaceId,
    );

    if (includeWatchers) {
      watcherIds.forEach((id) => candidates.add(id));
    }

    if (includeExplicitPermission) {
      const explicitIds =
        await this.recipientsRepo.findExplicitPagePermissionUserIds(pageId);
      explicitIds.forEach((id) => candidates.add(id));
    }

    if (includeVerifiers) {
      const verifierIds =
        await this.recipientsRepo.findVerifierUserIds(pageId);
      verifierIds.forEach((id) => candidates.add(id));
    }

    if (excludeWatchers) {
      watcherIds.forEach((id) => candidates.delete(id));
    }

    const mutedIds =
      await this.recipientsRepo.findMutedPageWatcherIds(pageId);
    mutedIds.forEach((id) => candidates.delete(id));

    actorIds.filter(Boolean).forEach((id) => candidates.delete(id));

    if (excludeConnected && candidates.size > 0) {
      const connectedIds = await this.getConnectedUserIds(pageId);
      connectedIds.forEach((id) => candidates.delete(id));
    }

    if (candidates.size === 0) return [];

    return this.filterPageAccessible([...candidates], pageId, spaceId);
  }

  /** Keeps only users with space access and (restriction-aware) page access. */
  async filterPageAccessible(
    userIds: string[],
    pageId: string,
    spaceId: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      userIds,
      spaceId,
    );
    if (inSpace.size === 0) return [];

    return this.pagePermissionRepo.getUserIdsWithPageAccess(pageId, [
      ...inSpace,
    ]);
  }

  private async getConnectedUserIds(pageId: string): Promise<string[]> {
    try {
      const ids = await this.collaborationGateway.handleYjsEvent(
        'getConnectedUserIds',
        `page.${pageId}`,
        undefined,
        true,
      );
      return Array.isArray(ids) ? ids : [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Failed to resolve connected users for page ${pageId}: ${message}`,
      );
      return [];
    }
  }
}
