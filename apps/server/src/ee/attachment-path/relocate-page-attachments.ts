import { Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import {
  buildPageAttachmentDir,
  buildPageAttachmentPath,
  getPageChainIds,
} from './page-attachment-path';

const logger = new Logger('RelocatePageAttachments');

/**
 * Moves the attachments of the given pages (and all their descendants) to
 * the folder matching the page's current place in the tree. Idempotent.
 * The DB path is switched only after the copy succeeded and the old object
 * is deleted last, so a failure leaves files readable at the old path.
 * Never throws: callers run it after their own transaction has committed.
 * ponytail: in-process and sequential; move to the attachment queue if
 * very large subtrees make moves slow.
 */
export async function relocatePageAttachments(
  db: KyselyDB,
  storage: StorageService,
  rootPageIds: string[],
): Promise<void> {
  try {
    if (!rootPageIds.length) return;

    const { rows: pages } = await sql<{
      id: string;
      parentPageId: string | null;
      spaceId: string;
      workspaceId: string;
    }>`
      with recursive tree as (
        select id, parent_page_id, space_id, workspace_id from pages
        where id = any(${rootPageIds}::uuid[])
        union
        select p.id, p.parent_page_id, p.space_id, p.workspace_id
        from pages p join tree t on p.parent_page_id = t.id
      )
      select id, parent_page_id as "parentPageId", space_id as "spaceId",
             workspace_id as "workspaceId" from tree
    `.execute(db);
    if (!pages.length) return;

    const byId = new Map(pages.map((p) => [p.id, p]));
    const chainCache = new Map<string, string[]>();
    const chainOf = async (id: string): Promise<string[]> => {
      const cached = chainCache.get(id);
      if (cached) return cached;
      const page = byId.get(id)!;
      const parent = page.parentPageId && byId.get(page.parentPageId);
      // above the loaded subtree, ask the DB once
      const chain = parent
        ? [...(await chainOf(parent.id)), id]
        : await getPageChainIds(db, id);
      chainCache.set(id, chain);
      return chain;
    };

    const attachments = await db
      .selectFrom('attachments')
      .select(['id', 'filePath', 'fileName', 'pageId'])
      .where('pageId', 'in', Array.from(byId.keys()))
      .execute();

    for (const att of attachments) {
      try {
        const page = byId.get(att.pageId!)!;
        const dir = buildPageAttachmentDir({
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          pageChainIds: await chainOf(page.id),
        });
        const target = buildPageAttachmentPath(dir, att.id, att.fileName);

        if (target !== att.filePath) {
          await storage.copy(att.filePath, target);
          await db
            .updateTable('attachments')
            .set({ filePath: target, spaceId: page.spaceId })
            .where('id', '=', att.id)
            .execute();
          await storage.delete(att.filePath).catch((err) =>
            logger.warn(`left old object ${att.filePath}: ${err}`),
          );
        }
      } catch (err) {
        logger.error(`Failed to relocate attachment ${att.id}: ${err}`);
      }
    }
  } catch (err) {
    logger.error(`Failed to relocate page attachments: ${err}`);
  }
}
