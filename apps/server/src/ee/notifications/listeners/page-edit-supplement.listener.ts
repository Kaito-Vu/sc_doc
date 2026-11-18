import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventName } from '../../../common/events/event.contants';
import { PageHistoryRecordedEvent } from '../../../common/events/page-history-recorded.event';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { IPageEditSupplementJob } from '../../../integrations/queue/constants/queue.interface';

@Injectable()
export class PageEditSupplementListener {
  private readonly logger = new Logger(PageEditSupplementListener.name);

  constructor(
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  @OnEvent(EventName.PAGE_HISTORY_RECORDED)
  async handle(event: PageHistoryRecordedEvent): Promise<void> {
    if (event.contributorIds.length === 0 || !event.hadPreviousContent) return;

    const job: IPageEditSupplementJob = {
      pageId: event.pageId,
      spaceId: event.spaceId,
      workspaceId: event.workspaceId,
      actorIds: event.contributorIds,
    } as IPageEditSupplementJob;
    await this.notificationQueue
      .add(QueueJob.PAGE_EDIT_SUPPLEMENT, job)
      .catch((err) => {
        this.logger.error(
          `Failed to queue page edit supplement for ${event.pageId}: ${err.message}`,
        );
      });
  }
}
