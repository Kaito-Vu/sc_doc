import { Injectable } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { UserRole } from '../../common/helpers/types/permission';

export type StatsPeriod = 'week' | 'month' | 'year';

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

@Injectable()
export class StatisticsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly userRepo: UserRepo,
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  private periodToDays(period: StatsPeriod): number {
    switch (period) {
      case 'week':
        return 7;
      case 'month':
        return 30;
      case 'year':
        return 365;
    }
  }

  async getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    const [
      totalPages,
      totalUsers,
      totalActiveUsers,
      totalSpaces,
      storageUsedBytes,
      usersNeverLoggedIn,
      pagesCreatedByWeek,
      usersJoinedByWeek,
      ownerCount,
      adminCount,
      memberCount,
    ] = await Promise.all([
      this.pageRepo.countByWorkspaceId(workspaceId),
      this.userRepo.countByWorkspaceId(workspaceId),
      this.userRepo.countActiveByWorkspaceId(workspaceId),
      this.spaceRepo.countByWorkspaceId(workspaceId),
      this.attachmentRepo.sumFileSizeByWorkspaceId(workspaceId),
      this.userRepo.countNeverLoggedInByWorkspaceId(workspaceId),
      this.pageRepo.countCreatedByWeek(workspaceId, 12),
      this.userRepo.countJoinedByWeek(workspaceId, 12),
      this.userRepo.roleCountByWorkspaceId(UserRole.OWNER, workspaceId),
      this.userRepo.roleCountByWorkspaceId(UserRole.ADMIN, workspaceId),
      this.userRepo.roleCountByWorkspaceId(UserRole.MEMBER, workspaceId),
    ]);

    return {
      totalPages,
      totalUsers,
      totalActiveUsers,
      totalSpaces,
      storageUsedBytes,
      usersNeverLoggedIn,
      usersByRole: [
        { role: UserRole.OWNER, count: ownerCount },
        { role: UserRole.ADMIN, count: adminCount },
        { role: UserRole.MEMBER, count: memberCount },
      ],
      pagesCreatedByWeek: pagesCreatedByWeek.map((r) => ({
        weekStart: r.weekStart.toISOString(),
        count: r.count,
      })),
      usersJoinedByWeek: usersJoinedByWeek.map((r) => ({
        weekStart: r.weekStart.toISOString(),
        count: r.count,
      })),
    };
  }

  async getSpaceStats(
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
    period: StatsPeriod,
  ): Promise<ContributorStat[]> {
    const since = new Date(
      Date.now() - this.periodToDays(period) * 24 * 60 * 60 * 1000,
    );

    const [created, edited] = await Promise.all([
      this.pageRepo.countCreatedByUserSince({ ...scope, since }),
      this.pageHistoryRepo.countEditsByUserSince({ ...scope, since }),
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
}
