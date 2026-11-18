import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  IPageBacklinkJob,
  IPageEditSupplementJob,
  IPageUpdateNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import {
  extractMentions,
  extractPageMentions,
  extractInternalLinkSlugIds,
} from '../../common/helpers/prosemirror/utils';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CollabHistoryService } from './collab-history.service';
import { WatcherService } from '../../core/watcher/watcher.service';
import { isEmptyParagraphDoc } from '../collaboration.util';
import { isSameDocumentContent } from '../content-comparison.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventName } from '../../common/events/event.contants';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { isSameTitle } from '../../core/page/verification/page-verification-invalidation.utils';

@Injectable()
export class PageHistoryRecorderService {
  private readonly logger = new Logger(PageHistoryRecorderService.name);

  constructor(
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly pageRepo: PageRepo,
    private readonly collabHistory: CollabHistoryService,
    private readonly watcherService: WatcherService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(QueueName.GENERAL_QUEUE) private generalQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  // Returns the id of the version holding the page's current title and content.
  async recordPageHistory(
    pageId: string,
    opts?: { allowEmpty?: boolean },
  ): Promise<string | null> {
    const page = await this.pageRepo.findById(pageId, {
      includeContent: true,
    });

    if (!page) {
      this.logger.warn(`Page ${pageId} not found, skipping history`);
      await this.collabHistory.clearContributors(pageId);
      return null;
    }

    const lastHistory = await this.pageHistoryRepo.findPageLastHistory(pageId, {
      includeContent: true,
    });

    if (
      !lastHistory &&
      !opts?.allowEmpty &&
      isEmptyParagraphDoc(page.content as any)
    ) {
      this.logger.debug(
        `Skipping first history for page ${pageId}: empty content`,
      );
      await this.collabHistory.clearContributors(pageId);
      return null;
    }

    // block ids, defaults and comments change the JSON without changing what readers see
    if (
      lastHistory &&
      isSameDocumentContent(lastHistory.content, page.content) &&
      isSameTitle(lastHistory.title, page.title)
    ) {
      return lastHistory.id;
    }

    const contributorIds = await this.collabHistory.popContributors(pageId);

    let historyId: string;
    try {
      await this.watcherService.addPageWatchers(
        contributorIds,
        pageId,
        page.spaceId,
        page.workspaceId,
      );

      const saved = await this.pageHistoryRepo.saveHistory(page, {
        contributorIds,
      });
      historyId = saved.id;
      this.logger.debug(`History created for page: ${pageId}`);

      // Collaborative edits arrive over the websocket, not the REST endpoints:
      // record one audit row per saved snapshot and announce the content update.
      await this.auditPageContentUpdate(page, contributorIds, historyId);
      this.eventEmitter.emit(EventName.PAGE_CONTENT_UPDATED, {
        pageId,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        historyId,
        actorIds: contributorIds,
      });
    } catch (err) {
      await this.collabHistory.addContributors(pageId, contributorIds);
      throw err;
    }

    const mentions = page.content ? extractMentions(page.content) : [];
    const pageMentions = extractPageMentions(mentions);
    const internalLinkSlugIds = page.content
      ? extractInternalLinkSlugIds(page.content)
      : [];

    await this.generalQueue
      .add(QueueJob.PAGE_BACKLINKS, {
        pageId,
        workspaceId: page.workspaceId,
        mentions: pageMentions,
        internalLinkSlugIds,
      } as IPageBacklinkJob)
      .catch((err) => {
        this.logger.error(
          `Failed to queue backlinks for ${pageId}: ${err.message}`,
        );
      });

    if (contributorIds.length > 0 && lastHistory?.content) {
      const pageUpdateJob = {
        pageId,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorIds: contributorIds,
      };
      await this.notificationQueue
        .add(QueueJob.PAGE_UPDATED, pageUpdateJob as IPageUpdateNotificationJob)
        .catch((err) => {
          this.logger.error(
            `Failed to queue page update notification for ${pageId}: ${err.message}`,
          );
        });
      await this.notificationQueue
        .add(
          QueueJob.PAGE_EDIT_SUPPLEMENT,
          pageUpdateJob as IPageEditSupplementJob,
        )
        .catch((err) => {
          this.logger.error(
            `Failed to queue page edit supplement for ${pageId}: ${err.message}`,
          );
        });
    }

    return historyId;
  }

  private async auditPageContentUpdate(
    page: { id: string; spaceId: string; workspaceId: string; title?: string },
    contributorIds: string[],
    historyId: string,
  ): Promise<void> {
    if (!this.db || contributorIds.length === 0) return;

    try {
      await this.db
        .insertInto('audit')
        .values({
          workspaceId: page.workspaceId,
          actorId: contributorIds[0],
          actorType: 'user',
          event: AuditEvent.PAGE_UPDATED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId: page.spaceId,
          changes: { after: { title: page.title ?? null } },
          metadata: { source: 'collaboration', historyId, contributorIds },
        })
        .execute();
    } catch (err: any) {
      // Auditing must never block saving the history row.
      this.logger.warn(
        `Failed to write page.updated audit for ${page.id}: ${err?.message}`,
      );
    }
  }
}
