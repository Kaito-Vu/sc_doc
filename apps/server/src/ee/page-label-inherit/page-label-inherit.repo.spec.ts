import { PageLabelInheritRepo } from './page-label-inherit.repo';
import { captureKysely } from '../common/test-kysely';

describe('PageLabelInheritRepo', () => {
  it('copies parent labels, skipping pages with own labels', async () => {
    const { db, queries } = captureKysely();
    await new PageLabelInheritRepo(db).copyParentLabels(['p1', 'p2']);
    expect(queries[0].sql).toBe(
      'insert into "page_labels" ("page_id", "label_id") select "pages"."id" as "page_id", "page_labels"."label_id" from "pages" inner join "page_labels" on "page_labels"."page_id" = "pages"."parent_page_id" where "pages"."id" in ($1, $2) and not exists (select "own"."id" from "page_labels" as "own" where "own"."page_id" = "pages"."id") on conflict do nothing',
    );
    expect(queries[0].parameters).toEqual(['p1', 'p2']);
  });
});
