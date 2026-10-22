import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EventName } from '../../common/events/event.contants';

// New sub-pages copy their parent's labels once, at creation. After that the
// child's labels are independent (edited via the regular label API/UI).
@Injectable()
export class PageLabelInheritListener {
  private readonly logger = new Logger(PageLabelInheritListener.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @OnEvent(EventName.PAGE_CREATED)
  async handlePageCreated(event: { pageIds: string[] }): Promise<void> {
    if (!event?.pageIds?.length) return;
    try {
      // Skip pages that already have labels (e.g. duplicated pages, which copy
      // their source's labels) so we never override explicit labels.
      await this.db
        .insertInto('pageLabels')
        .columns(['pageId', 'labelId'])
        .expression((eb) =>
          eb
            .selectFrom('pages')
            .innerJoin('pageLabels', 'pageLabels.pageId', 'pages.parentPageId')
            .select(['pages.id as pageId', 'pageLabels.labelId'])
            .where('pages.id', 'in', event.pageIds)
            .where((eb2) =>
              eb2.not(
                eb2.exists(
                  eb2
                    .selectFrom('pageLabels as own')
                    .select('own.id')
                    .whereRef('own.pageId', '=', 'pages.id'),
                ),
              ),
            ),
        )
        .onConflict((oc) => oc.doNothing())
        .execute();
    } catch (err) {
      this.logger.warn(`Label inheritance failed: ${(err as Error).message}`);
    }
  }
}
