import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { isUserDisabled } from '../../common/helpers/utils';
import { STATS_TZ_OFFSET_MINUTES } from '../statistics/statistics.utils';

export const HEATMAP_DAYS = 365;
const DAY_MS = 24 * 3600 * 1000;

const localDay = (d: Date) =>
  new Date(d.getTime() + STATS_TZ_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);

export type ProfileExtrasViewer = {
  userId: string;
  workspaceId: string;
  canManageMembers: boolean;
};

export type HeatmapDay = { date: string; count: number };

@Injectable()
export class UserProfileExtrasService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  // same visibility rule as core UserProfileService.findVisibleUser
  private async findVisibleUser(userId: string, viewer: ProfileExtrasViewer) {
    const user = await this.userRepo.findById(userId, viewer.workspaceId);
    if (!user || (isUserDisabled(user) && !viewer.canManageMembers)) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // '<provider type | local>-<email local part>'; provider_user_id is an LDAP DN / OIDC sub, too long for a URL
  private handles(workspaceId: string) {
    return sql`
      select u.id,
        coalesce(ap.type, 'local') || '-' || lower(split_part(u.email, '@', 1)) as handle
      from users u
      left join auth_accounts aa on aa.user_id = u.id and aa.deleted_at is null
      left join auth_providers ap on ap.id = aa.auth_provider_id
      where u.workspace_id = ${workspaceId}`;
  }

  async resolveHandle(handle: string, viewer: ProfileExtrasViewer) {
    const { rows } = await sql<{ id: string }>`
      select distinct id from (${this.handles(viewer.workspaceId)}) h
      where handle = ${handle} limit 2`.execute(this.db);
    // ambiguous handles never resolve; the profile is then only reachable by id
    if (rows.length !== 1) throw new NotFoundException('User not found');
    await this.findVisibleUser(rows[0].id, viewer);
    return { userId: rows[0].id };
  }

  // null when the handle is shared by several users
  private async handleOf(userId: string, workspaceId: string) {
    const { rows } = await sql<{ handle: string; n: string }>`
      select h.handle, (select count(distinct x.id) from (${this.handles(workspaceId)}) x
        where x.handle = h.handle) as n
      from (${this.handles(workspaceId)}) h where h.id = ${userId} limit 1`.execute(
      this.db,
    );
    return rows[0] && Number(rows[0].n) === 1 ? rows[0].handle : null;
  }

  async getExtras(targetUserId: string, viewer: ProfileExtrasViewer) {
    const user = await this.findVisibleUser(targetUserId, viewer);

    const now = new Date();
    return {
      handle: await this.handleOf(targetUserId, viewer.workspaceId),
      jobTitle: user.jobTitle ?? null,
      department: user.department ?? null,
      employeeId: user.employeeId ?? null,
      heatmap: await this.getHeatmap(targetUserId, viewer, now),
      // calendar range of the heatmap in the stats time zone, 'YYYY-MM-DD'
      heatmapFrom: localDay(new Date(now.getTime() - HEATMAP_DAYS * DAY_MS)),
      heatmapTo: localDay(now),
    };
  }

  // pages created + page-history snapshots authored per day, limited to pages the viewer can open
  async getHeatmap(
    targetUserId: string,
    viewer: ProfileExtrasViewer,
    now = new Date(),
  ): Promise<HeatmapDay[]> {
    const since = new Date(now.getTime() - HEATMAP_DAYS * DAY_MS);
    const day = (col: string) =>
      sql<string>`to_char((${sql.raw(col)} AT TIME ZONE 'UTC') + make_interval(mins => ${STATS_TZ_OFFSET_MINUTES}::int), 'YYYY-MM-DD')`.as(
        'day',
      );
    const viewerSpaces = this.spaceMemberRepo.getUserSpaceIdsQuery(
      viewer.userId,
      { excludeArchived: true },
    );
    const canAccess = this.pagePermissionRepo.canUserAccessPageExpression(
      viewer.userId,
    );

    const created = this.db
      .selectFrom('pages')
      .select(day('pages.created_at'))
      .where('pages.creatorId', '=', targetUserId)
      .where('pages.createdAt', '>=', since)
      .where('pages.workspaceId', '=', viewer.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where('pages.spaceId', 'in', viewerSpaces)
      .where(canAccess);

    const edited = this.db
      .selectFrom('pageHistory')
      .innerJoin('pages', 'pages.id', 'pageHistory.pageId')
      .select(day('page_history.created_at'))
      .where('pageHistory.lastUpdatedById', '=', targetUserId)
      .where('pageHistory.createdAt', '>=', since)
      .where('pages.workspaceId', '=', viewer.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where('pages.spaceId', 'in', viewerSpaces)
      .where(canAccess);

    const rows = await this.db
      .selectFrom(created.unionAll(edited).as('activity'))
      .select(['activity.day as date', sql<string>`count(*)`.as('count')])
      .groupBy('activity.day')
      .orderBy('activity.day')
      .execute();

    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
