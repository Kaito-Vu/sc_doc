import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

// S3 keys are limited to 1024 bytes; each level costs 37 chars.
// ponytail: deeper trees keep only the nearest ancestors, still unique via pageId.
const MAX_LEVELS = 15;

/** Page ids from the root page down to `pageId` (inclusive). */
export async function getPageChainIds(
  db: KyselyDB | KyselyTransaction,
  pageId: string,
): Promise<string[]> {
  const { rows } = await sql<{ id: string }>`
    with recursive chain as (
      select id, parent_page_id, 0 as depth from pages where id = ${pageId}
      union all
      select p.id, p.parent_page_id, c.depth + 1
      from pages p join chain c on c.parent_page_id = p.id
    )
    select id from chain order by depth desc
  `.execute(db);
  return rows.map((r) => r.id);
}

/** {workspaceId}/{spaceId}/{rootPageId}/.../{pageId} */
export function buildPageAttachmentDir(opts: {
  workspaceId: string;
  spaceId: string;
  pageChainIds: string[];
}): string {
  const chain = opts.pageChainIds.slice(-MAX_LEVELS);
  return [opts.workspaceId, opts.spaceId, ...chain].join('/');
}

/** {pageDir}/{attachmentId}-{fileName} */
export function buildPageAttachmentPath(
  pageDir: string,
  attachmentId: string,
  fileName: string,
): string {
  return `${pageDir}/${attachmentId}-${fileName}`;
}

export async function getPageAttachmentDir(
  db: KyselyDB | KyselyTransaction,
  page: { id: string; spaceId: string; workspaceId: string },
): Promise<string> {
  const chain = await getPageChainIds(db, page.id);
  return buildPageAttachmentDir({
    workspaceId: page.workspaceId,
    spaceId: page.spaceId,
    // page not found (e.g. not yet inserted): fall back to its own folder
    pageChainIds: chain.length ? chain : [page.id],
  });
}
