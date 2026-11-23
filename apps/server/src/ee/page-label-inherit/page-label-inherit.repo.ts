import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class PageLabelInheritRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  // Copies the parent's labels onto the given pages, skipping pages that
  // already have labels (e.g. duplicated pages) so explicit labels are kept.
  async copyParentLabels(pageIds: string[]): Promise<void> {
    await this.db
      .insertInto('pageLabels')
      .columns(['pageId', 'labelId'])
      .expression((eb) =>
        eb
          .selectFrom('pages')
          .innerJoin('pageLabels', 'pageLabels.pageId', 'pages.parentPageId')
          .select(['pages.id as pageId', 'pageLabels.labelId'])
          .where('pages.id', 'in', pageIds)
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
  }
}
