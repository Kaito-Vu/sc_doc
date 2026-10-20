import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EePageContext, EeSpaceContext } from './notification.types';

@Injectable()
export class NotificationRecipientsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findPageContexts(pageIds: string[]): Promise<EePageContext[]> {
    if (pageIds.length === 0) return [];

    return this.db
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select([
        'pages.id',
        'pages.title',
        'pages.slugId',
        'pages.spaceId',
        'pages.workspaceId',
        'pages.parentPageId',
        'pages.creatorId',
        'pages.deletedById',
        'spaces.slug as spaceSlug',
        'spaces.name as spaceName',
      ])
      .where('pages.id', 'in', pageIds)
      .execute();
  }

  async findSpaceContext(
    spaceId: string,
  ): Promise<EeSpaceContext | undefined> {
    return this.db
      .selectFrom('spaces')
      .select(['id', 'slug', 'name', 'workspaceId'])
      .where('id', '=', spaceId)
      .executeTakeFirst();
  }

  /**
   * Users explicitly granted access to the page (directly or through a group),
   * including permissions inherited from restricted ancestor pages.
   * Users who only have space-level access are intentionally excluded.
   */
  async findExplicitPagePermissionUserIds(pageId: string): Promise<string[]> {
    const result = await sql<{ userId: string }>`
      WITH RECURSIVE ancestors AS (
        SELECT id AS ancestor_id, parent_page_id
        FROM pages
        WHERE id = ${pageId}::uuid
        UNION ALL
        SELECT p.id, p.parent_page_id
        FROM pages p
        JOIN ancestors a ON a.parent_page_id = p.id
      )
      SELECT DISTINCT granted.user_id AS "userId"
      FROM (
        SELECT pp.user_id
        FROM page_permissions pp
        JOIN page_access pa ON pa.id = pp.page_access_id
        WHERE pa.page_id IN (SELECT ancestor_id FROM ancestors)
          AND pp.user_id IS NOT NULL
        UNION
        SELECT gu.user_id
        FROM page_permissions pp
        JOIN page_access pa ON pa.id = pp.page_access_id
        JOIN group_users gu ON gu.group_id = pp.group_id
        WHERE pa.page_id IN (SELECT ancestor_id FROM ancestors)
      ) AS granted
      JOIN users u ON u.id = granted.user_id
      WHERE u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
    `.execute(this.db);

    return result.rows.map((row) => row.userId);
  }

  /** Verifiers assigned to the latest verification cycle of a page. */
  async findVerifierUserIds(pageId: string): Promise<string[]> {
    const latest = await this.db
      .selectFrom('pageVerifications')
      .select('id')
      .where('pageId', '=', pageId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!latest) return [];

    const rows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', latest.id)
      .execute();

    return rows.map((row) => row.userId);
  }

  async findWorkspaceHostname(
    workspaceId: string,
  ): Promise<string | undefined> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('hostname')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return workspace?.hostname;
  }

  async findMutedPageWatcherIds(pageId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('watchers')
      .select('userId')
      .where('pageId', '=', pageId)
      .where('type', '=', 'page')
      .where('mutedAt', 'is not', null)
      .execute();

    return rows.map((row) => row.userId);
  }

  async findUserIdsByGroupIds(groupIds: string[]): Promise<string[]> {
    if (groupIds.length === 0) return [];

    const rows = await this.db
      .selectFrom('groupUsers')
      .select('userId')
      .where('groupId', 'in', groupIds)
      .execute();

    return rows.map((row) => row.userId);
  }

  async findUserNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.db
      .selectFrom('users')
      .select(['id', 'name'])
      .where('id', 'in', userIds)
      .execute();

    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
