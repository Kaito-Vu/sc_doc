import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../../common/events/event.contants';
import { PageLabelInheritRepo } from './page-label-inherit.repo';

// New sub-pages copy their parent's labels once, at creation. After that the
// child's labels are independent (edited via the regular label API/UI).
@Injectable()
export class PageLabelInheritListener {
  private readonly logger = new Logger(PageLabelInheritListener.name);

  constructor(private readonly repo: PageLabelInheritRepo) {}

  @OnEvent(EventName.PAGE_CREATED)
  async handlePageCreated(event: { pageIds: string[] }): Promise<void> {
    if (!event?.pageIds?.length) return;
    try {
      await this.repo.copyParentLabels(event.pageIds);
    } catch (err) {
      this.logger.warn(`Label inheritance failed: ${(err as Error).message}`);
    }
  }
}
