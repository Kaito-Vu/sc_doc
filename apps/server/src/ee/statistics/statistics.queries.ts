import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { MonthlyCount, STATS_TZ_OFFSET_MINUTES } from './statistics.utils';

export interface SpaceRankRow {
  spaceId: string;
  name: string;
  slug: string;
  value: number;
}

export interface DateRange {
  since: Date;
  until: Date;
}

const num = (v: unknown) => Number(v ?? 0);

/**
 * Aggregate-only SQL for the extra statistics. Lives in ee/ so core repos stay untouched.
 * Every query is scoped by workspace_id and ignores soft-deleted pages/spaces/users/comments.
 */
@Injectable()
export class StatisticsQueries {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  // 'YYYY-MM' bucket of a timestamptz column in the stats time zone.
  private bucket(col: string) {
    return sql`to_char((${sql.raw(col)} AT TIME ZONE 'UTC') + make_interval(mins => ${STATS_TZ_OFFSET_MINUTES}::int), 'YYYY-MM')`;
  }

  private async monthly(query: { execute: (db: KyselyDB) => Promise<any> }) {
    const { rows } = await query.execute(this.db);
    return rows.map((r: any) => ({
      month: r.month,
      count: num(r.count),
    })) as MonthlyCount[];
  }

  pagesCreatedByMonth(workspaceId: string, since: Date) {
    return this.monthly(sql`
      SELECT ${this.bucket('created_at')} AS month, count(*) AS count
      FROM pages
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND created_at >= ${since}
      GROUP BY 1`);
  }

  usersJoinedByMonth(workspaceId: string, since: Date) {
    return this.monthly(sql`
      SELECT ${this.bucket('created_at')} AS month, count(*) AS count
      FROM users
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND created_at >= ${since}
      GROUP BY 1`);
  }

  /** Edits (page history snapshots) and distinct editors per month. */
  async editsByMonth(workspaceId: string, since: Date) {
    const { rows } = await sql<any>`
      SELECT ${this.bucket('created_at')} AS month,
             count(*) AS edits,
             count(DISTINCT last_updated_by_id) AS editors
      FROM page_history
      WHERE workspace_id = ${workspaceId} AND created_at >= ${since}
      GROUP BY 1`.execute(this.db);
    return {
      edits: rows.map((r) => ({ month: r.month, count: num(r.edits) })),
      editors: rows.map((r) => ({ month: r.month, count: num(r.editors) })),
    };
  }

  async activeUsers(workspaceId: string, since7d: Date, since30d: Date) {
    const { rows } = await sql<any>`
      SELECT count(*) FILTER (WHERE COALESCE(last_active_at, last_login_at) >= ${since7d}) AS d7,
             count(*) FILTER (WHERE COALESCE(last_active_at, last_login_at) >= ${since30d}) AS d30
      FROM users
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND deactivated_at IS NULL`.execute(
      this.db,
    );
    return { last7Days: num(rows[0]?.d7), last30Days: num(rows[0]?.d30) };
  }

  /** Pages whose last update is older than each cutoff (optionally within one space). */
  async stalePages(
    workspaceId: string,
    cutoffs: { d90: Date; d180: Date },
    spaceId?: string,
  ) {
    const { rows } = await sql<any>`
      SELECT count(*) FILTER (WHERE updated_at < ${cutoffs.d90}) AS d90,
             count(*) FILTER (WHERE updated_at < ${cutoffs.d180}) AS d180
      FROM pages
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        ${spaceId ? sql`AND space_id = ${spaceId}` : sql``}`.execute(this.db);
    return { over90Days: num(rows[0]?.d90), over180Days: num(rows[0]?.d180) };
  }

  /** Latest verification per page, resolved to the same status names as resolveVerificationStatus. */
  async verificationStatusCounts(
    workspaceId: string,
    expiringWarningBefore: Date,
    now: Date,
  ) {
    const { rows } = await sql<any>`
      SELECT type, status, count(*) AS count FROM (
        SELECT DISTINCT ON (pv.page_id) pv.type,
          CASE
            WHEN pv.type = 'qms' THEN COALESCE(pv.status, 'draft')
            WHEN pv.status = 'obsolete' THEN 'obsolete'
            WHEN pv.verified_at IS NULL THEN 'draft'
            WHEN pv.expires_at IS NULL THEN 'verified'
            WHEN pv.expires_at <= ${now} THEN 'expired'
            WHEN pv.expires_at <= ${expiringWarningBefore} THEN 'expiring'
            ELSE 'verified'
          END AS status
        FROM page_verifications pv
        JOIN pages p ON p.id = pv.page_id AND p.deleted_at IS NULL
        WHERE pv.workspace_id = ${workspaceId}
        ORDER BY pv.page_id, pv.created_at DESC
      ) latest
      GROUP BY type, status`.execute(this.db);
    return rows.map((r) => ({
      type: r.type as string,
      status: r.status as string,
      count: num(r.count),
    }));
  }

  /** Comments created in [since, until) and open top-level threads. */
  async comments(workspaceId: string, range: DateRange, spaceId?: string) {
    const { rows } = await sql<any>`
      SELECT count(*) FILTER (WHERE c.created_at >= ${range.since} AND c.created_at < ${range.until}) AS month_count,
             count(*) FILTER (WHERE c.parent_comment_id IS NULL AND c.resolved_at IS NULL) AS unresolved
      FROM comments c
      JOIN pages p ON p.id = c.page_id AND p.deleted_at IS NULL
      WHERE c.workspace_id = ${workspaceId} AND c.deleted_at IS NULL
        ${spaceId ? sql`AND c.space_id = ${spaceId}` : sql``}`.execute(this.db);
    return {
      createdInMonth: num(rows[0]?.monthCount),
      unresolved: num(rows[0]?.unresolved),
    };
  }

  // Live (non-deleted, non-archived) spaces joined to an aggregate, top 10 by value.
  private async topSpaces(query: {
    execute: (db: KyselyDB) => Promise<any>;
  }): Promise<SpaceRankRow[]> {
    const { rows } = await query.execute(this.db);
    return rows.map((r: any) => ({
      spaceId: r.id,
      name: r.name,
      slug: r.slug,
      value: num(r.value),
    }));
  }

  topSpacesByPages(workspaceId: string) {
    return this.topSpaces(sql`
      SELECT s.id, s.name, s.slug, count(p.id) AS value
      FROM spaces s JOIN pages p ON p.space_id = s.id AND p.deleted_at IS NULL
      WHERE s.workspace_id = ${workspaceId} AND s.deleted_at IS NULL AND s.archived_at IS NULL
      GROUP BY s.id ORDER BY value DESC LIMIT 10`);
  }

  topSpacesByStale(workspaceId: string, cutoff: Date) {
    return this.topSpaces(sql`
      SELECT s.id, s.name, s.slug, count(p.id) AS value
      FROM spaces s JOIN pages p ON p.space_id = s.id AND p.deleted_at IS NULL AND p.updated_at < ${cutoff}
      WHERE s.workspace_id = ${workspaceId} AND s.deleted_at IS NULL AND s.archived_at IS NULL
      GROUP BY s.id ORDER BY value DESC LIMIT 10`);
  }

  topSpacesByStorage(workspaceId: string) {
    return this.topSpaces(sql`
      SELECT s.id, s.name, s.slug, COALESCE(sum(a.file_size), 0) AS value
      FROM spaces s JOIN attachments a ON a.space_id = s.id AND a.deleted_at IS NULL
      WHERE s.workspace_id = ${workspaceId} AND s.deleted_at IS NULL AND s.archived_at IS NULL
      GROUP BY s.id ORDER BY value DESC LIMIT 10`);
  }

  async editsBySpace(
    workspaceId: string,
    spaceIds: string[],
    range: DateRange,
  ): Promise<Map<string, number>> {
    if (!spaceIds.length) return new Map();
    const rows = await this.db
      .selectFrom('pageHistory')
      .select((eb) => ['spaceId', eb.fn.count('id').as('count')])
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', 'in', spaceIds)
      .where('createdAt', '>=', range.since)
      .where('createdAt', '<', range.until)
      .groupBy('spaceId')
      .execute();
    return new Map(rows.map((r) => [r.spaceId, num(r.count)]));
  }

  async memberCounts(spaceIds: string[]): Promise<Map<string, number>> {
    if (!spaceIds.length) return new Map();
    const rows = await this.db
      .selectFrom('spaces')
      .select('spaces.id')
      .select(this.spaceRepo.withMemberCount)
      .where('spaces.id', 'in', spaceIds)
      .execute();
    return new Map(rows.map((r: any) => [r.id, num(r.memberCount)]));
  }

  /** Pages created / live pages touched / edit snapshots inside [since, until). */
  async spaceMonthActivity(
    workspaceId: string,
    spaceId: string,
    range: DateRange,
  ) {
    const [pages, edits] = await Promise.all([
      sql<any>`
        SELECT count(*) FILTER (WHERE created_at >= ${range.since} AND created_at < ${range.until}) AS created,
               count(*) FILTER (WHERE updated_at >= ${range.since} AND updated_at < ${range.until}) AS touched
        FROM pages
        WHERE workspace_id = ${workspaceId} AND space_id = ${spaceId} AND deleted_at IS NULL`.execute(
        this.db,
      ),
      sql<any>`
        SELECT count(*) AS edits
        FROM page_history ph JOIN pages p ON p.id = ph.page_id AND p.deleted_at IS NULL
        WHERE ph.workspace_id = ${workspaceId} AND ph.space_id = ${spaceId}
          AND ph.created_at >= ${range.since} AND ph.created_at < ${range.until}`.execute(
        this.db,
      ),
    ]);
    return {
      pagesCreated: num(pages.rows[0]?.created),
      pagesEdited: num(pages.rows[0]?.touched),
      edits: num(edits.rows[0]?.edits),
    };
  }

  async mostEditedPages(workspaceId: string, spaceId: string, range: DateRange) {
    const { rows } = await sql<any>`
      SELECT p.id, p.slug_id, p.title, p.icon, count(ph.id) AS edits
      FROM page_history ph JOIN pages p ON p.id = ph.page_id AND p.deleted_at IS NULL
      WHERE ph.workspace_id = ${workspaceId} AND ph.space_id = ${spaceId}
        AND ph.created_at >= ${range.since} AND ph.created_at < ${range.until}
      GROUP BY p.id ORDER BY edits DESC LIMIT 5`.execute(this.db);
    return rows.map((r) => ({
      pageId: r.id as string,
      slugId: r.slugId as string,
      title: (r.title as string | null) ?? '',
      icon: (r.icon as string | null) ?? null,
      edits: num(r.edits),
    }));
  }
}
