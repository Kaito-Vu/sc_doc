import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { PageHistoryRecordedEvent } from '../../common/events/page-history-recorded.event';

// Collaborative edits arrive over the websocket, not the REST endpoints:
// record one audit row per saved snapshot.
@Injectable()
export class PageHistoryAuditListener {
  private readonly logger = new Logger(PageHistoryAuditListener.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @OnEvent(EventName.PAGE_HISTORY_RECORDED)
  async handle(event: PageHistoryRecordedEvent): Promise<void> {
    if (event.contributorIds.length === 0) return;

    try {
      await this.db
        .insertInto('audit')
        .values({
          workspaceId: event.workspaceId,
          actorId: event.contributorIds[0],
          actorType: 'user',
          event: AuditEvent.PAGE_UPDATED,
          resourceType: AuditResource.PAGE,
          resourceId: event.pageId,
          spaceId: event.spaceId,
          changes: { after: { title: event.title ?? null } },
          metadata: {
            source: 'collaboration',
            historyId: event.historyId,
            contributorIds: event.contributorIds,
          },
        })
        .execute();
    } catch (err: any) {
      // Auditing must never block saving the history row.
      this.logger.warn(
        `Failed to write page.updated audit for ${event.pageId}: ${err?.message}`,
      );
    }
  }
}
