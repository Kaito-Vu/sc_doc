import { Injectable } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { UserRole } from '../../common/helpers/types/permission';
import { ttlMemo } from '../common/ttl-memo';
import { EXPIRING_WARNING_MS } from '../page-verification/page-verification.status';
import { StatisticsQueries, SpaceRankRow } from './statistics.queries';
import {
  lastMonthKeys,
  mergeMonthly,
  monthBounds,
  resolveMonthRange,
} from './statistics.utils';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeeklyCount {
  weekStart: string;
  count: number;
}

export interface RoleCount {
  role: string;
  count: number;
}

export interface WorkspaceStats {
  totalPages: number;
  totalUsers: number;
  totalActiveUsers: number;
  totalSpaces: number;
  usersByRole: RoleCount[];
  storageUsedBytes: number;
  usersNeverLoggedIn: number;
  pagesCreatedByWeek: WeeklyCount[];
  usersJoinedByWeek: WeeklyCount[];
}

export interface SpaceStats {
  totalPages: number;
  totalMembers: number;
  pagesUpdatedLast7Days: number;
}

export interface ContributorStat {
  userId: string;
  name: string;
  avatarUrl: string | null;
  createdCount: number;
  editCount: number;
  contributionScore: number;
}

export interface MonthlyTrendPoint {
  month: string;
  pagesCreated: number;
  activeEditors: number;
  newUsers: number;
  edits: number;
}

export interface VerificationSummary {
  expiring: Record<string, number>;
  qms: Record<string, number>;
  total: number;
}

export interface WorkspaceExtraStats {
  monthlyTrend: MonthlyTrendPoint[];
  activeUsers: { last7Days: number; last30Days: number };
  stalePages: { over90Days: number; over180Days: number };
  verification: VerificationSummary;
  comments: { createdThisMonth: number; unresolved: number };
}

export interface SpacesRanking {
  month: string;
  byPages: (SpaceRankRow & { editsThisMonth: number; memberCount: number })[];
  byStorage: SpaceRankRow[];
  byStalePages: SpaceRankRow[];
}

export interface SpaceOverview {
  month: string;
  pagesCreated: number;
  pagesEdited: number;
  edits: number;
  comments: { createdInMonth: number; unresolved: number };
  stalePages90Days: number;
  mostEditedPages: {
    pageId: string;
    slugId: string;
    title: string;
    icon: string | null;
    edits: number;
  }[];
}

/** Fold (type,status,count) rows into per-type status maps. */
export function summarizeVerification(
  rows: { type: string; status: string; count: number }[],
): VerificationSummary {
  const out: VerificationSummary = { expiring: {}, qms: {}, total: 0 };
  for (const r of rows) {
    const bucket = r.type === 'qms' ? out.qms : out.expiring;
    bucket[r.status] = (bucket[r.status] ?? 0) + r.count;
    out.total += r.count;
  }
  return out;
}

@Injectable()
export class StatisticsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly userRepo: UserRepo,
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly queries: StatisticsQueries,
  ) {}

  private buildWeeklyBuckets(
    rows: { weekStart: Date; count: number }[],
    weeksBack: number,
  ): WeeklyCount[] {
    const now = new Date();
    const dayOfWeek = (now.getUTCDay() + 6) % 7; // 0=Mon..6=Sun, matches Postgres date_trunc('week', ...) which starts on Monday
    const currentWeekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - dayOfWeek,
      ),
    );

    const countByKey = new Map<string, number>();
    for (const row of rows) {
      const key = new Date(row.weekStart).toISOString().slice(0, 10);
      countByKey.set(key, row.count);
    }

    const buckets: WeeklyCount[] = [];
    for (let i = weeksBack - 1; i >= 0; i--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
      const key = weekStart.toISOString().slice(0, 10);
      buckets.push({
        weekStart: weekStart.toISOString(),
        count: countByKey.get(key) ?? 0,
      });
    }
    return buckets;
  }

  getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    // 6 queries in 2 small batches (pool is 10): memoize briefly per workspace
    return ttlMemo(`ws-stats:${workspaceId}`, 60_000, () =>
      this.computeWorkspaceStats(workspaceId),
    );
  }

  private async computeWorkspaceStats(
    workspaceId: string,
  ): Promise<WorkspaceStats> {
    const [userCounts, totalPages, totalSpaces] = await Promise.all([
      this.queries.workspaceUserCounts(workspaceId),
      this.pageRepo.countByWorkspaceId(workspaceId),
      this.spaceRepo.countByWorkspaceId(workspaceId),
    ]);
    const [storageUsedBytes, pagesCreatedByWeek, usersJoinedByWeek] =
      await Promise.all([
        this.attachmentRepo.sumFileSizeByWorkspaceId(workspaceId),
        this.pageRepo.countCreatedByWeek(workspaceId, 12),
        this.userRepo.countJoinedByWeek(workspaceId, 12),
      ]);

    return {
      totalPages,
      totalUsers: userCounts.total,
      totalActiveUsers: userCounts.active,
      totalSpaces,
      storageUsedBytes,
      usersNeverLoggedIn: userCounts.neverLoggedIn,
      usersByRole: [
        { role: UserRole.OWNER, count: userCounts.owners },
        { role: UserRole.ADMIN, count: userCounts.admins },
        { role: UserRole.MEMBER, count: userCounts.members },
      ],
      pagesCreatedByWeek: this.buildWeeklyBuckets(pagesCreatedByWeek, 12),
      usersJoinedByWeek: this.buildWeeklyBuckets(usersJoinedByWeek, 12),
    };
  }

  getSpaceStats(spaceId: string, workspaceId: string): Promise<SpaceStats> {
    return ttlMemo(`space-stats:${workspaceId}:${spaceId}`, 60_000, () =>
      this.computeSpaceStats(spaceId, workspaceId),
    );
  }

  private async computeSpaceStats(
    spaceId: string,
    workspaceId: string,
  ): Promise<SpaceStats> {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalPages, space, pagesUpdatedLast7Days] = await Promise.all([
      this.pageRepo.countBySpaceId(spaceId),
      this.spaceRepo.findById(spaceId, workspaceId, {
        includeMemberCount: true,
      }),
      this.pageRepo.countUpdatedSince(spaceId, since7d),
    ]);

    return {
      totalPages,
      totalMembers: Number((space as any)?.memberCount ?? 0),
      pagesUpdatedLast7Days,
    };
  }

  async getTopContributors(
    scope: { workspaceId: string; spaceId?: string },
    month?: string,
  ): Promise<ContributorStat[]> {
    const range = resolveMonthRange(month); // validate before memoizing
    return ttlMemo(
      `contrib:${scope.workspaceId}:${scope.spaceId ?? '-'}:${range.month}`,
      60_000,
      () => this.computeTopContributors(scope, range),
    );
  }

  private async computeTopContributors(
    scope: { workspaceId: string; spaceId?: string },
    { since, until }: { since: Date; until: Date },
  ): Promise<ContributorStat[]> {

    const [created, edited] = await Promise.all([
      this.pageRepo.countCreatedByUserSince({ ...scope, since, until }),
      this.pageHistoryRepo.countEditsByUserSince({ ...scope, since, until }),
    ]);

    const merged = new Map<string, ContributorStat>();

    for (const row of created) {
      merged.set(row.userId, {
        userId: row.userId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        createdCount: row.count,
        editCount: 0,
        contributionScore: row.count,
      });
    }

    for (const row of edited) {
      const existing = merged.get(row.userId);
      if (existing) {
        existing.editCount = row.count;
        existing.contributionScore += row.count;
      } else {
        merged.set(row.userId, {
          userId: row.userId,
          name: row.name,
          avatarUrl: row.avatarUrl,
          createdCount: 0,
          editCount: row.count,
          contributionScore: row.count,
        });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.contributionScore - a.contributionScore)
      .slice(0, 10);
  }

  getWorkspaceExtra(workspaceId: string): Promise<WorkspaceExtraStats> {
    return ttlMemo(`ws-extra:${workspaceId}`, 60_000, () =>
      this.computeWorkspaceExtra(workspaceId),
    );
  }

  private async computeWorkspaceExtra(
    workspaceId: string,
  ): Promise<WorkspaceExtraStats> {
    const now = new Date();
    const keys = lastMonthKeys(12, now);
    const since = monthBounds(keys[0]).since;
    const current = resolveMonthRange(undefined, now);
    const q = this.queries;

    // two small batches: the DB pool is 10 and other requests share it
    const [pagesCreated, newUsers, editsAgg, activeUsers] = await Promise.all([
      q.pagesCreatedByMonth(workspaceId, since),
      q.usersJoinedByMonth(workspaceId, since),
      q.editsByMonth(workspaceId, since),
      q.activeUsers(
        workspaceId,
        new Date(now.getTime() - 7 * DAY_MS),
        new Date(now.getTime() - 30 * DAY_MS),
      ),
    ]);
    const [stalePages, verificationRows, comments] = await Promise.all([
      q.stalePages(workspaceId, {
        d90: new Date(now.getTime() - 90 * DAY_MS),
        d180: new Date(now.getTime() - 180 * DAY_MS),
      }),
      q.verificationStatusCounts(
        workspaceId,
        new Date(now.getTime() + EXPIRING_WARNING_MS),
        now,
      ),
      q.comments(workspaceId, current),
    ]);

    return {
      monthlyTrend: mergeMonthly(keys, {
        pagesCreated,
        activeEditors: editsAgg.editors,
        newUsers,
        edits: editsAgg.edits,
      }),
      activeUsers,
      stalePages,
      verification: summarizeVerification(verificationRows),
      comments: {
        createdThisMonth: comments.createdInMonth,
        unresolved: comments.unresolved,
      },
    };
  }

  getSpacesRanking(workspaceId: string): Promise<SpacesRanking> {
    return ttlMemo(`ws-spaces-ranking:${workspaceId}`, 60_000, () =>
      this.computeSpacesRanking(workspaceId),
    );
  }

  private async computeSpacesRanking(
    workspaceId: string,
  ): Promise<SpacesRanking> {
    const range = resolveMonthRange();
    const q = this.queries;
    const [byPages, byStorage] = await Promise.all([
      q.topSpacesByPages(workspaceId),
      q.topSpacesByStorage(workspaceId),
    ]);
    const ids = byPages.map((s) => s.spaceId);
    const [byStalePages, edits, members] = await Promise.all([
      q.topSpacesByStale(workspaceId, new Date(Date.now() - 90 * DAY_MS)),
      q.editsBySpace(workspaceId, ids, range),
      q.memberCounts(ids),
    ]);

    return {
      month: range.month,
      byPages: byPages.map((s) => ({
        ...s,
        editsThisMonth: edits.get(s.spaceId) ?? 0,
        memberCount: members.get(s.spaceId) ?? 0,
      })),
      byStorage,
      byStalePages,
    };
  }

  getSpaceOverview(
    spaceId: string,
    workspaceId: string,
    month?: string,
  ): Promise<SpaceOverview> {
    const range = resolveMonthRange(month); // validate before memoizing
    return ttlMemo(`space-overview:${spaceId}:${range.month}`, 60_000, () =>
      this.computeSpaceOverview(spaceId, workspaceId, range),
    );
  }

  private async computeSpaceOverview(
    spaceId: string,
    workspaceId: string,
    range: { month: string; since: Date; until: Date },
  ): Promise<SpaceOverview> {
    const q = this.queries;
    const [activity, comments, stale, mostEditedPages] = await Promise.all([
      q.spaceMonthActivity(workspaceId, spaceId, range),
      q.comments(workspaceId, range, spaceId),
      q.stalePages(
        workspaceId,
        {
          d90: new Date(Date.now() - 90 * DAY_MS),
          d180: new Date(Date.now() - 180 * DAY_MS),
        },
        spaceId,
      ),
      q.mostEditedPages(workspaceId, spaceId, range),
    ]);
    return {
      month: range.month,
      ...activity,
      comments,
      stalePages90Days: stale.over90Days,
      mostEditedPages,
    };
  }
}
