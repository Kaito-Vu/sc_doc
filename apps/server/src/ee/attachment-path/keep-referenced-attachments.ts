import { Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

const logger = new Logger('KeepReferencedAttachments');

/**
 * A file belongs to the page it was uploaded on, but copy/paste and page
 * duplication let other pages show it too. Before a page/space delete wipes
 * its files, every file still shown by another live page is handed over to
 * that page instead. Returns only the attachments that are safe to delete.
 * Throws on DB errors so the delete job fails (and retries) rather than
 * deleting blindly.
 * ponytail: scans live pages' content as text per job; add a reference
 * table if deletes of big workspaces get slow.
 */
export async function keepReferencedAttachments<T extends { id: string }>(
  db: KyselyDB,
  attachments: T[],
): Promise<T[]> {
  if (!attachments?.length) return attachments ?? [];

  const { rows } = await sql<{ id: string; pageId: string; spaceId: string }>`
    select distinct on (a.id) a.id, p.id as "pageId", p.space_id as "spaceId"
    from attachments a
    join pages p
      on p.workspace_id = a.workspace_id
     and p.deleted_at is null
     and p.id is distinct from a.page_id
     and (p.content::text like '%' || a.id::text || '%'
          or p.cover_photo like '%' || a.id::text || '%')
    where a.id = any(${attachments.map((a) => a.id)}::uuid[])
    order by a.id, p.updated_at desc
  `.execute(db);

  for (const row of rows) {
    await db
      .updateTable('attachments')
      .set({ pageId: row.pageId, spaceId: row.spaceId })
      .where('id', '=', row.id)
      .execute();
    logger.log(`Kept attachment ${row.id}: still used by page ${row.pageId}`);
  }

  const kept = new Set(rows.map((r) => r.id));
  return attachments.filter((a) => !kept.has(a.id));
}
