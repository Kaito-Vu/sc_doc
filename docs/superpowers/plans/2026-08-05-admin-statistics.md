# Admin Statistics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workspace admins a workspace-wide statistics tab and space admins a per-space statistics tab, both showing snapshot counts, weekly trend charts, and a top-contributor leaderboard.

**Architecture:** New EE module (`ee/statistics` on both server and client), following the existing `ee/personal-space` pattern — all logic in `ee/`, core files get only mechanical 1-2 line wire-ins. Snapshot/trend metrics are computed on demand from existing timestamped columns (`pages.createdAt`, `users.createdAt`, `pageHistory.createdAt`) — no new tables, no cron jobs.

**Tech Stack:** NestJS + Kysely (server), React + TanStack Query + Mantine 9 + new `@mantine/charts` dependency (client).

## Global Constraints

- All new logic lives under `ee/` (server: `apps/server/src/ee/statistics/`, client: `apps/client/src/ee/statistics/`) per the fork's Golden Rule — core files only get an import + a line of usage/data.
- Gate the whole feature behind `Feature.STATISTICS` (new flag, same mechanism as `Feature.PERSONAL_SPACES`): `@RequireFeature` on server routes, `useHasFeature` on the client.
- "Active user" = `deactivatedAt IS NULL`, evaluated at request time (no time window).
- Trend charts (`pagesCreatedByWeek`, `usersJoinedByWeek`) are weekly buckets over the last 12 weeks, derived from `createdAt` — no snapshot table.
- Top contributors: `contributionScore = createdCount + editCount` over a rolling window (`week` = 7 days, `month` = 30 days, `year` = 365 days from now, not calendar-aligned). `createdCount` from `pages.creatorId`, `editCount` from `pageHistory.lastUpdatedById` (one row per saved version).
- Repository methods (pure Kysely query builders) are not unit-tested — this matches the existing codebase convention (zero `*.repo.ts` spec files exist anywhere in `apps/server/src`). They're exercised indirectly through the `StatisticsService` tests (mocked) and the manual verification task.
- Space-admin authorization reuses `SpaceAbilityFactory` + `SpaceCaslAction.Manage`/`SpaceCaslSubject.Settings` (same check as space update/delete). Workspace-admin authorization reuses `WorkspaceAbilityFactory` + `WorkspaceCaslAction.Manage`/`WorkspaceCaslSubject.Settings` (same check as workspace update). All new endpoints are POST + `@Body()` DTOs, matching every existing controller in this codebase (no GET+`@Query()` endpoints exist).

---

## Task 1: Server — feature flag + repository count/aggregate methods

**Files:**
- Modify: `apps/server/src/common/features.ts`
- Modify: `apps/server/src/database/repos/page/page.repo.ts`
- Modify: `apps/server/src/database/repos/page/page-history.repo.ts`
- Modify: `apps/server/src/database/repos/user/user.repo.ts`
- Modify: `apps/server/src/database/repos/attachment/attachment.repo.ts`
- Modify: `apps/server/src/database/repos/space/space.repo.ts`

**Interfaces:**
- Produces (consumed by Task 2's `StatisticsService`):
  - `PageRepo.countByWorkspaceId(workspaceId: string): Promise<number>`
  - `PageRepo.countBySpaceId(spaceId: string): Promise<number>`
  - `PageRepo.countUpdatedSince(spaceId: string, since: Date): Promise<number>`
  - `PageRepo.countCreatedByWeek(workspaceId: string, weeksBack: number): Promise<{ weekStart: Date; count: number }[]>`
  - `PageRepo.countCreatedByUserSince(params: { workspaceId: string; spaceId?: string; since: Date }): Promise<{ userId: string; name: string; avatarUrl: string | null; count: number }[]>`
  - `PageHistoryRepo.countEditsByUserSince(params: { workspaceId: string; spaceId?: string; since: Date }): Promise<{ userId: string; name: string; avatarUrl: string | null; count: number }[]>`
  - `UserRepo.countByWorkspaceId(workspaceId: string): Promise<number>`
  - `UserRepo.countActiveByWorkspaceId(workspaceId: string): Promise<number>`
  - `UserRepo.countNeverLoggedInByWorkspaceId(workspaceId: string): Promise<number>`
  - `UserRepo.countJoinedByWeek(workspaceId: string, weeksBack: number): Promise<{ weekStart: Date; count: number }[]>`
  - `AttachmentRepo.sumFileSizeByWorkspaceId(workspaceId: string): Promise<number>`
  - `SpaceRepo.countByWorkspaceId(workspaceId: string): Promise<number>`
- Consumes: existing `UserRepo.roleCountByWorkspaceId(role, workspaceId)` (already implemented, `apps/server/src/database/repos/user/user.repo.ts:147`), existing `SpaceRepo.findById(spaceId, workspaceId, { includeMemberCount: true })` (already implemented, `apps/server/src/database/repos/space/space.repo.ts:25`).

- [ ] **Step 1: Add the `STATISTICS` feature flag**

Edit `apps/server/src/common/features.ts`, add one line to the `Feature` object (after `BASES: 'bases',`):

```ts
  BASES: 'bases',
  STATISTICS: 'statistics',
} as const;
```

- [ ] **Step 2: Add page count/aggregate methods to `PageRepo`**

Edit `apps/server/src/database/repos/page/page.repo.ts`. Add these methods inside the `PageRepo` class (after the constructor, before `baseFields` or anywhere else in the class body):

```ts
  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('pages')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countBySpaceId(spaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('pages')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countUpdatedSince(spaceId: string, since: Date): Promise<number> {
    const result = await this.db
      .selectFrom('pages')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .where('updatedAt', '>=', since)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countCreatedByWeek(
    workspaceId: string,
    weeksBack: number,
  ): Promise<{ weekStart: Date; count: number }[]> {
    const since = new Date(
      Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000,
    );
    const rows = await this.db
      .selectFrom('pages')
      .select((eb) => [
        sql<Date>`date_trunc('week', "createdAt")`.as('weekStart'),
        eb.fn.count('id').as('count'),
      ])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .groupBy(sql`date_trunc('week', "createdAt")`)
      .orderBy(sql`date_trunc('week', "createdAt")`, 'asc')
      .execute();

    return rows.map((r) => ({
      weekStart: r.weekStart as Date,
      count: Number(r.count),
    }));
  }

  async countCreatedByUserSince(params: {
    workspaceId: string;
    spaceId?: string;
    since: Date;
  }): Promise<
    { userId: string; name: string; avatarUrl: string | null; count: number }[]
  > {
    let query = this.db
      .selectFrom('pages')
      .innerJoin('users', 'users.id', 'pages.creatorId')
      .select((eb) => [
        'pages.creatorId as userId',
        'users.name as name',
        'users.avatarUrl as avatarUrl',
        eb.fn.count('pages.id').as('count'),
      ])
      .where('pages.workspaceId', '=', params.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where('pages.createdAt', '>=', params.since)
      .groupBy(['pages.creatorId', 'users.name', 'users.avatarUrl']);

    if (params.spaceId) {
      query = query.where('pages.spaceId', '=', params.spaceId);
    }

    const rows = await query.execute();
    return rows.map((r) => ({
      userId: r.userId as string,
      name: r.name as string,
      avatarUrl: r.avatarUrl as string | null,
      count: Number(r.count),
    }));
  }
```

`sql` is already imported at the top of this file (`import { ExpressionBuilder, sql } from 'kysely';`) — no new import needed.

- [ ] **Step 3: Add edit-count method to `PageHistoryRepo`**

Edit `apps/server/src/database/repos/page/page-history.repo.ts`. Add this method inside the `PageHistoryRepo` class:

```ts
  async countEditsByUserSince(params: {
    workspaceId: string;
    spaceId?: string;
    since: Date;
  }): Promise<
    { userId: string; name: string; avatarUrl: string | null; count: number }[]
  > {
    let query = this.db
      .selectFrom('pageHistory')
      .innerJoin('users', 'users.id', 'pageHistory.lastUpdatedById')
      .select((eb) => [
        'pageHistory.lastUpdatedById as userId',
        'users.name as name',
        'users.avatarUrl as avatarUrl',
        eb.fn.count('pageHistory.id').as('count'),
      ])
      .where('pageHistory.workspaceId', '=', params.workspaceId)
      .where('pageHistory.createdAt', '>=', params.since)
      .groupBy([
        'pageHistory.lastUpdatedById',
        'users.name',
        'users.avatarUrl',
      ]);

    if (params.spaceId) {
      query = query.where('pageHistory.spaceId', '=', params.spaceId);
    }

    const rows = await query.execute();
    return rows.map((r) => ({
      userId: r.userId as string,
      name: r.name as string,
      avatarUrl: r.avatarUrl as string | null,
      count: Number(r.count),
    }));
  }
```

`sql` is not needed here; this file already imports what it needs (`ExpressionBuilder, sql` are already imported but unused imports are fine — both are already used elsewhere in the file).

- [ ] **Step 4: Add user count methods to `UserRepo`**

Edit `apps/server/src/database/repos/user/user.repo.ts`. Add these methods inside the `UserRepo` class:

```ts
  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countActiveByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countNeverLoggedInByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('lastLoginAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countJoinedByWeek(
    workspaceId: string,
    weeksBack: number,
  ): Promise<{ weekStart: Date; count: number }[]> {
    const since = new Date(
      Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000,
    );
    const rows = await this.db
      .selectFrom('users')
      .select((eb) => [
        sql<Date>`date_trunc('week', "createdAt")`.as('weekStart'),
        eb.fn.count('id').as('count'),
      ])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .groupBy(sql`date_trunc('week', "createdAt")`)
      .orderBy(sql`date_trunc('week', "createdAt")`, 'asc')
      .execute();

    return rows.map((r) => ({
      weekStart: r.weekStart as Date,
      count: Number(r.count),
    }));
  }
```

`sql` is already imported at the top of this file.

- [ ] **Step 5: Add storage-sum method to `AttachmentRepo`**

Edit `apps/server/src/database/repos/attachment/attachment.repo.ts`. Add this method inside the `AttachmentRepo` class:

```ts
  async sumFileSizeByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('attachments')
      .select((eb) => eb.fn.sum('fileSize').as('total'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.total ?? 0);
  }
```

- [ ] **Step 6: Add space count method to `SpaceRepo`**

Edit `apps/server/src/database/repos/space/space.repo.ts`. Add this method inside the `SpaceRepo` class:

```ts
  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('spaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter ./apps/server exec tsc --noEmit -p apps/server/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/common/features.ts \
  apps/server/src/database/repos/page/page.repo.ts \
  apps/server/src/database/repos/page/page-history.repo.ts \
  apps/server/src/database/repos/user/user.repo.ts \
  apps/server/src/database/repos/attachment/attachment.repo.ts \
  apps/server/src/database/repos/space/space.repo.ts
git commit -m "feat(statistics): add STATISTICS feature flag and repo count methods"
```

---

## Task 2: Server — `StatisticsService` (TDD)

**Files:**
- Create: `apps/server/src/ee/statistics/statistics.service.ts`
- Create: `apps/server/src/ee/statistics/statistics.service.spec.ts`

**Interfaces:**
- Consumes: all repo methods from Task 1, plus existing `UserRepo.roleCountByWorkspaceId(role, workspaceId)` and `SpaceRepo.findById(spaceId, workspaceId, opts)`.
- Produces (consumed by Task 3's controller):
  - `StatisticsService.getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats>`
  - `StatisticsService.getSpaceStats(spaceId: string, workspaceId: string): Promise<SpaceStats>`
  - `StatisticsService.getTopContributors(scope: { workspaceId: string; spaceId?: string }, period: 'week' | 'month' | 'year'): Promise<ContributorStat[]>`
  - Types `WorkspaceStats`, `SpaceStats`, `ContributorStat`, `StatsPeriod` exported from this file.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/ee/statistics/statistics.service.spec.ts`:

```ts
import { StatisticsService } from './statistics.service';

describe('StatisticsService.getTopContributors', () => {
  let pageRepo: { countCreatedByUserSince: jest.Mock };
  let pageHistoryRepo: { countEditsByUserSince: jest.Mock };
  let service: StatisticsService;

  beforeEach(() => {
    pageRepo = { countCreatedByUserSince: jest.fn() };
    pageHistoryRepo = { countEditsByUserSince: jest.fn() };
    service = new StatisticsService(
      pageRepo as any,
      {} as any,
      pageHistoryRepo as any,
      {} as any,
      {} as any,
    );
  });

  it('merges created and edited counts into a combined score, sorted descending', async () => {
    pageRepo.countCreatedByUserSince.mockResolvedValue([
      { userId: 'u1', name: 'Alice', avatarUrl: null, count: 5 },
      { userId: 'u2', name: 'Bob', avatarUrl: null, count: 1 },
    ]);
    pageHistoryRepo.countEditsByUserSince.mockResolvedValue([
      { userId: 'u1', name: 'Alice', avatarUrl: null, count: 3 },
      { userId: 'u3', name: 'Carol', avatarUrl: null, count: 10 },
    ]);

    const result = await service.getTopContributors(
      { workspaceId: 'ws1' },
      'week',
    );

    expect(result).toEqual([
      {
        userId: 'u3',
        name: 'Carol',
        avatarUrl: null,
        createdCount: 0,
        editCount: 10,
        contributionScore: 10,
      },
      {
        userId: 'u1',
        name: 'Alice',
        avatarUrl: null,
        createdCount: 5,
        editCount: 3,
        contributionScore: 8,
      },
      {
        userId: 'u2',
        name: 'Bob',
        avatarUrl: null,
        createdCount: 1,
        editCount: 0,
        contributionScore: 1,
      },
    ]);
  });

  it('passes a ~365-day window for "year" and a ~7-day window for "week"', async () => {
    pageRepo.countCreatedByUserSince.mockResolvedValue([]);
    pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);
    const now = Date.now();

    await service.getTopContributors({ workspaceId: 'ws1' }, 'year');
    const yearSince = pageRepo.countCreatedByUserSince.mock.calls[0][0].since;
    const yearDays = (now - yearSince.getTime()) / (24 * 60 * 60 * 1000);
    expect(yearDays).toBeGreaterThan(364);
    expect(yearDays).toBeLessThan(366);

    await service.getTopContributors({ workspaceId: 'ws1' }, 'week');
    const weekSince = pageRepo.countCreatedByUserSince.mock.calls[1][0].since;
    const weekDays = (now - weekSince.getTime()) / (24 * 60 * 60 * 1000);
    expect(weekDays).toBeGreaterThan(6);
    expect(weekDays).toBeLessThan(8);
  });

  it('limits results to the top 10 contributors', async () => {
    const created = Array.from({ length: 15 }, (_, i) => ({
      userId: `u${i}`,
      name: `User ${i}`,
      avatarUrl: null,
      count: i + 1,
    }));
    pageRepo.countCreatedByUserSince.mockResolvedValue(created);
    pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);

    const result = await service.getTopContributors(
      { workspaceId: 'ws1' },
      'month',
    );

    expect(result).toHaveLength(10);
    expect(result[0].userId).toBe('u14');
  });

  it('passes spaceId through to both repo calls when scoped to a space', async () => {
    pageRepo.countCreatedByUserSince.mockResolvedValue([]);
    pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);

    await service.getTopContributors(
      { workspaceId: 'ws1', spaceId: 'sp1' },
      'week',
    );

    expect(pageRepo.countCreatedByUserSince.mock.calls[0][0]).toMatchObject({
      workspaceId: 'ws1',
      spaceId: 'sp1',
    });
    expect(
      pageHistoryRepo.countEditsByUserSince.mock.calls[0][0],
    ).toMatchObject({ workspaceId: 'ws1', spaceId: 'sp1' });
  });
});

describe('StatisticsService.getWorkspaceStats', () => {
  it('assembles counts, role breakdown, and trends from the injected repos', async () => {
    const pageRepo = {
      countByWorkspaceId: jest.fn().mockResolvedValue(42),
      countCreatedByWeek: jest
        .fn()
        .mockResolvedValue([{ weekStart: new Date('2026-01-05'), count: 3 }]),
    };
    const userRepo = {
      countByWorkspaceId: jest.fn().mockResolvedValue(10),
      countActiveByWorkspaceId: jest.fn().mockResolvedValue(8),
      countNeverLoggedInByWorkspaceId: jest.fn().mockResolvedValue(2),
      countJoinedByWeek: jest
        .fn()
        .mockResolvedValue([{ weekStart: new Date('2026-01-05'), count: 1 }]),
      roleCountByWorkspaceId: jest
        .fn()
        .mockImplementation((role: string) =>
          Promise.resolve(role === 'owner' ? 1 : role === 'admin' ? 2 : 7),
        ),
    };
    const attachmentRepo = {
      sumFileSizeByWorkspaceId: jest.fn().mockResolvedValue(1024),
    };
    const spaceRepo = { countByWorkspaceId: jest.fn().mockResolvedValue(5) };

    const service = new StatisticsService(
      pageRepo as any,
      userRepo as any,
      {} as any,
      attachmentRepo as any,
      spaceRepo as any,
    );

    const result = await service.getWorkspaceStats('ws1');

    expect(result.totalPages).toBe(42);
    expect(result.totalUsers).toBe(10);
    expect(result.totalActiveUsers).toBe(8);
    expect(result.totalSpaces).toBe(5);
    expect(result.storageUsedBytes).toBe(1024);
    expect(result.usersNeverLoggedIn).toBe(2);
    expect(result.usersByRole).toEqual([
      { role: 'owner', count: 1 },
      { role: 'admin', count: 2 },
      { role: 'member', count: 7 },
    ]);
    expect(result.pagesCreatedByWeek).toEqual([
      { weekStart: '2026-01-05T00:00:00.000Z', count: 3 },
    ]);
    expect(result.usersJoinedByWeek).toEqual([
      { weekStart: '2026-01-05T00:00:00.000Z', count: 1 },
    ]);
  });
});

describe('StatisticsService.getSpaceStats', () => {
  it('assembles page count, member count, and recent-activity count', async () => {
    const pageRepo = {
      countBySpaceId: jest.fn().mockResolvedValue(7),
      countUpdatedSince: jest.fn().mockResolvedValue(3),
    };
    const spaceRepo = {
      findById: jest.fn().mockResolvedValue({ memberCount: 4 }),
    };

    const service = new StatisticsService(
      pageRepo as any,
      {} as any,
      {} as any,
      {} as any,
      spaceRepo as any,
    );

    const result = await service.getSpaceStats('sp1', 'ws1');

    expect(result).toEqual({
      totalPages: 7,
      totalMembers: 4,
      pagesUpdatedLast7Days: 3,
    });
    expect(spaceRepo.findById).toHaveBeenCalledWith('sp1', 'ws1', {
      includeMemberCount: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter ./apps/server exec jest apps/server/src/ee/statistics/statistics.service.spec.ts`
Expected: FAIL — `Cannot find module './statistics.service'`.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/ee/statistics/statistics.service.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ./apps/server exec jest apps/server/src/ee/statistics/statistics.service.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ee/statistics/statistics.service.ts \
  apps/server/src/ee/statistics/statistics.service.spec.ts
git commit -m "feat(statistics): add StatisticsService with unit tests"
```

---

## Task 3: Server — DTOs, controller, module, wire into `ee.module.ts`

**Files:**
- Create: `apps/server/src/ee/statistics/dto/workspace-top-contributors.dto.ts`
- Create: `apps/server/src/ee/statistics/dto/space-top-contributors.dto.ts`
- Create: `apps/server/src/ee/statistics/statistics.controller.ts`
- Create: `apps/server/src/ee/statistics/statistics.module.ts`
- Modify: `apps/server/src/ee/ee.module.ts`

(The space-stats endpoint reuses the existing `SpaceIdDto` from
`apps/server/src/core/space/dto/space-id.dto.ts` — no new DTO file is
created for it.)

**Interfaces:**
- Consumes: `StatisticsService` from Task 2; `SpaceIdDto` from `apps/server/src/core/space/dto/space-id.dto.ts` (existing, has `spaceId: string`); `WorkspaceAbilityFactory`/`WorkspaceCaslAction`/`WorkspaceCaslSubject` from `apps/server/src/core/casl/`; `SpaceAbilityFactory`/`SpaceCaslAction`/`SpaceCaslSubject` from `apps/server/src/core/casl/`; `RequireFeature` from `apps/server/src/ee/common/decorators/require-feature.decorator.ts`; `Feature.STATISTICS` from Task 1.
- Produces (consumed by Task 4's client service):
  - `POST /statistics/workspace` → `WorkspaceStats`
  - `POST /statistics/workspace/top-contributors` body `{ period }` → `ContributorStat[]`
  - `POST /statistics/space` body `{ spaceId }` → `SpaceStats`
  - `POST /statistics/space/top-contributors` body `{ spaceId, period }` → `ContributorStat[]`

- [ ] **Step 1: Create the request DTOs**

Create `apps/server/src/ee/statistics/dto/workspace-top-contributors.dto.ts`:

```ts
import { IsIn } from 'class-validator';

export class WorkspaceTopContributorsDto {
  @IsIn(['week', 'month', 'year'])
  period: 'week' | 'month' | 'year';
}
```

Create `apps/server/src/ee/statistics/dto/space-top-contributors.dto.ts`:

```ts
import { IsIn, IsString } from 'class-validator';

export class SpaceTopContributorsDto {
  @IsString()
  spaceId: string;

  @IsIn(['week', 'month', 'year'])
  period: 'week' | 'month' | 'year';
}
```

- [ ] **Step 2: Create the controller**

Create `apps/server/src/ee/statistics/statistics.controller.ts`:

```ts
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { StatisticsService } from './statistics.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { SpaceIdDto } from '../../core/space/dto/space-id.dto';
import { WorkspaceTopContributorsDto } from './dto/workspace-top-contributors.dto';
import { SpaceTopContributorsDto } from './dto/space-top-contributors.dto';

@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private assertWorkspaceAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  private async assertSpaceAdmin(user: User, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('workspace')
  @RequireFeature(Feature.STATISTICS)
  async getWorkspaceStats(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertWorkspaceAdmin(user, workspace);
    return this.statisticsService.getWorkspaceStats(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('workspace/top-contributors')
  @RequireFeature(Feature.STATISTICS)
  async getWorkspaceTopContributors(
    @Body() dto: WorkspaceTopContributorsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertWorkspaceAdmin(user, workspace);
    return this.statisticsService.getTopContributors(
      { workspaceId: workspace.id },
      dto.period,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('space')
  @RequireFeature(Feature.STATISTICS)
  async getSpaceStats(
    @Body() dto: SpaceIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpaceAdmin(user, dto.spaceId);
    return this.statisticsService.getSpaceStats(dto.spaceId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('space/top-contributors')
  @RequireFeature(Feature.STATISTICS)
  async getSpaceTopContributors(
    @Body() dto: SpaceTopContributorsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpaceAdmin(user, dto.spaceId);
    return this.statisticsService.getTopContributors(
      { workspaceId: workspace.id, spaceId: dto.spaceId },
      dto.period,
    );
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/server/src/ee/statistics/statistics.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { CaslModule } from '../../core/casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [StatisticsService],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
```

- [ ] **Step 4: Register the module in `ee.module.ts`**

Edit `apps/server/src/ee/ee.module.ts`. Add the import:

```ts
import { PersonalSpaceModule } from './personal-space/personal-space.module';
import { StatisticsModule } from './statistics/statistics.module';
```

Add `StatisticsModule` to the `imports` array (next to `PersonalSpaceModule`):

```ts
    PersonalSpaceModule,
    StatisticsModule,
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter ./apps/server exec tsc --noEmit -p apps/server/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Run the full server test suite to confirm nothing broke**

Run: `pnpm --filter ./apps/server run test`
Expected: PASS (all existing tests plus the new `statistics.service.spec.ts` suite).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/ee/statistics/dto \
  apps/server/src/ee/statistics/statistics.controller.ts \
  apps/server/src/ee/statistics/statistics.module.ts \
  apps/server/src/ee/ee.module.ts
git commit -m "feat(statistics): add statistics controller, module, and wire into EeModule"
```

---

## Task 4: Client — feature flag, types, service, query hooks

**Files:**
- Modify: `apps/client/src/ee/features.ts`
- Create: `apps/client/src/ee/statistics/types/statistics.types.ts`
- Create: `apps/client/src/ee/statistics/services/statistics-service.ts`
- Create: `apps/client/src/ee/statistics/queries/statistics-query.ts`

**Interfaces:**
- Consumes: `api` default export from `@/lib/api-client` (existing, used the same way in `personal-space-service.ts`).
- Produces (consumed by Task 5 and Task 6):
  - Types: `StatsPeriod`, `IWeeklyCount`, `IRoleCount`, `IWorkspaceStats`, `ISpaceStats`, `IContributorStat`
  - `useWorkspaceStatisticsQuery(enabled: boolean): UseQueryResult<IWorkspaceStats, Error>`
  - `useWorkspaceTopContributorsQuery(period: StatsPeriod, enabled: boolean): UseQueryResult<IContributorStat[], Error>`
  - `useSpaceStatisticsQuery(spaceId: string, enabled: boolean): UseQueryResult<ISpaceStats, Error>`
  - `useSpaceTopContributorsQuery(spaceId: string, period: StatsPeriod, enabled: boolean): UseQueryResult<IContributorStat[], Error>`

- [ ] **Step 1: Add the `STATISTICS` feature flag**

Edit `apps/client/src/ee/features.ts`, add one line to the `Feature` object (after `BASES: 'bases',`):

```ts
  BASES: 'bases',
  STATISTICS: 'statistics',
```

- [ ] **Step 2: Create the types file**

Create `apps/client/src/ee/statistics/types/statistics.types.ts`:

```ts
export type StatsPeriod = "week" | "month" | "year";

export interface IWeeklyCount {
  weekStart: string;
  count: number;
}

export interface IRoleCount {
  role: string;
  count: number;
}

export interface IWorkspaceStats {
  totalPages: number;
  totalUsers: number;
  totalActiveUsers: number;
  totalSpaces: number;
  usersByRole: IRoleCount[];
  storageUsedBytes: number;
  usersNeverLoggedIn: number;
  pagesCreatedByWeek: IWeeklyCount[];
  usersJoinedByWeek: IWeeklyCount[];
}

export interface ISpaceStats {
  totalPages: number;
  totalMembers: number;
  pagesUpdatedLast7Days: number;
}

export interface IContributorStat {
  userId: string;
  name: string;
  avatarUrl: string | null;
  createdCount: number;
  editCount: number;
  contributionScore: number;
}
```

- [ ] **Step 3: Create the service**

Create `apps/client/src/ee/statistics/services/statistics-service.ts`:

```ts
import api from "@/lib/api-client";
import {
  IContributorStat,
  ISpaceStats,
  IWorkspaceStats,
  StatsPeriod,
} from "@/ee/statistics/types/statistics.types";

export async function getWorkspaceStatistics(): Promise<IWorkspaceStats> {
  const req = await api.post<IWorkspaceStats>("/statistics/workspace", {});
  return req.data;
}

export async function getWorkspaceTopContributors(
  period: StatsPeriod,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/workspace/top-contributors",
    { period },
  );
  return req.data;
}

export async function getSpaceStatistics(
  spaceId: string,
): Promise<ISpaceStats> {
  const req = await api.post<ISpaceStats>("/statistics/space", { spaceId });
  return req.data;
}

export async function getSpaceTopContributors(
  spaceId: string,
  period: StatsPeriod,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/space/top-contributors",
    { spaceId, period },
  );
  return req.data;
}
```

- [ ] **Step 4: Create the query hooks**

Create `apps/client/src/ee/statistics/queries/statistics-query.ts`:

```ts
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  getSpaceStatistics,
  getSpaceTopContributors,
  getWorkspaceStatistics,
  getWorkspaceTopContributors,
} from "@/ee/statistics/services/statistics-service";
import {
  IContributorStat,
  ISpaceStats,
  IWorkspaceStats,
  StatsPeriod,
} from "@/ee/statistics/types/statistics.types";

export function useWorkspaceStatisticsQuery(
  enabled: boolean,
): UseQueryResult<IWorkspaceStats, Error> {
  return useQuery({
    queryKey: ["workspace-statistics"],
    queryFn: () => getWorkspaceStatistics(),
    enabled,
  });
}

export function useWorkspaceTopContributorsQuery(
  period: StatsPeriod,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["workspace-top-contributors", period],
    queryFn: () => getWorkspaceTopContributors(period),
    enabled,
  });
}

export function useSpaceStatisticsQuery(
  spaceId: string,
  enabled: boolean,
): UseQueryResult<ISpaceStats, Error> {
  return useQuery({
    queryKey: ["space-statistics", spaceId],
    queryFn: () => getSpaceStatistics(spaceId),
    enabled: enabled && !!spaceId,
  });
}

export function useSpaceTopContributorsQuery(
  spaceId: string,
  period: StatsPeriod,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["space-top-contributors", spaceId, period],
    queryFn: () => getSpaceTopContributors(spaceId, period),
    enabled: enabled && !!spaceId,
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/ee/features.ts apps/client/src/ee/statistics/types \
  apps/client/src/ee/statistics/services apps/client/src/ee/statistics/queries
git commit -m "feat(statistics): add client feature flag, types, service, and query hooks"
```

---

## Task 5: Client — `@mantine/charts` dependency + reusable components

**Files:**
- Modify: `apps/client/package.json` (via `pnpm add`)
- Create: `apps/client/src/ee/statistics/lib/format-bytes.ts`
- Create: `apps/client/src/ee/statistics/components/stat-card.tsx`
- Create: `apps/client/src/ee/statistics/components/trend-chart.tsx`
- Create: `apps/client/src/ee/statistics/components/top-contributors.tsx`

**Interfaces:**
- Consumes: `IWeeklyCount`, `IContributorStat`, `StatsPeriod` from Task 4's types file; `CustomAvatar` from `@/components/ui/custom-avatar.tsx` (existing).
- Produces (consumed by Task 6 and Task 7):
  - `formatBytes(bytes: number): string`
  - `<StatCard label={string} value={string | number} icon={React.ElementType} />`
  - `<TrendChart title={string} data={IWeeklyCount[]} seriesName={string} color?={string} />`
  - `<TopContributors data={IContributorStat[] | undefined} isLoading={boolean} period={StatsPeriod} onPeriodChange={(period: StatsPeriod) => void} />`

- [ ] **Step 1: Add the `@mantine/charts` dependency**

Run: `pnpm --filter ./apps/client add @mantine/charts@^9`
Expected: `apps/client/package.json` gains a `"@mantine/charts"` entry matching the installed `@mantine/core@9.3.2`.

- [ ] **Step 2: Create the byte-formatting helper**

Create `apps/client/src/ee/statistics/lib/format-bytes.ts`:

```ts
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
```

- [ ] **Step 3: Create `StatCard`**

Create `apps/client/src/ee/statistics/components/stat-card.tsx`:

```tsx
import { Group, Paper, Text, ThemeIcon } from "@mantine/core";
import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
}

export default function StatCard({ label, value, icon: IconComp }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" size={38} radius="md">
          <IconComp size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 4: Create `TrendChart`**

Create `apps/client/src/ee/statistics/components/trend-chart.tsx`:

```tsx
import { LineChart } from "@mantine/charts";
import { Paper, Text } from "@mantine/core";
import { IWeeklyCount } from "@/ee/statistics/types/statistics.types";

interface TrendChartProps {
  title: string;
  data: IWeeklyCount[];
  seriesName: string;
  color?: string;
}

export default function TrendChart({
  title,
  data,
  seriesName,
  color = "blue.6",
}: TrendChartProps) {
  const chartData = data.map((point) => ({
    week: new Date(point.weekStart).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    [seriesName]: point.count,
  }));

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        {title}
      </Text>
      <LineChart
        h={220}
        data={chartData}
        dataKey="week"
        series={[{ name: seriesName, color }]}
        curveType="linear"
        withDots={chartData.length <= 20}
      />
    </Paper>
  );
}
```

- [ ] **Step 5: Create `TopContributors`**

Create `apps/client/src/ee/statistics/components/top-contributors.tsx`:

```tsx
import { Group, Paper, SegmentedControl, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import {
  IContributorStat,
  StatsPeriod,
} from "@/ee/statistics/types/statistics.types";

interface TopContributorsProps {
  data: IContributorStat[] | undefined;
  isLoading: boolean;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export default function TopContributors({
  data,
  isLoading,
  period,
  onPeriodChange,
}: TopContributorsProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t("Top contributors")}</Text>
        <SegmentedControl
          size="xs"
          value={period}
          onChange={(value) => onPeriodChange(value as StatsPeriod)}
          data={[
            { label: t("Week"), value: "week" },
            { label: t("Month"), value: "month" },
            { label: t("Year"), value: "year" },
          ]}
        />
      </Group>

      <Stack gap="xs">
        {!isLoading && (!data || data.length === 0) && (
          <Text size="sm" c="dimmed">
            {t("No activity in this period yet.")}
          </Text>
        )}
        {data?.map((contributor, index) => (
          <Group
            key={contributor.userId}
            justify="space-between"
            wrap="nowrap"
          >
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" c="dimmed" w={20}>
                {index + 1}
              </Text>
              <CustomAvatar
                size="sm"
                avatarUrl={contributor.avatarUrl}
                name={contributor.name}
              />
              <Text size="sm" lineClamp={1}>
                {contributor.name}
              </Text>
            </Group>
            <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {t("{{created}} created · {{edited}} edited", {
                created: contributor.createdCount,
                edited: contributor.editCount,
              })}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/client/package.json apps/client/pnpm-lock.yaml \
  apps/client/src/ee/statistics/lib apps/client/src/ee/statistics/components
git commit -m "feat(statistics): add @mantine/charts and StatCard/TrendChart/TopContributors"
```

(If `pnpm-lock.yaml` lives at the repo root instead of `apps/client/`, adjust the `git add` path accordingly — check with `git status` before committing.)

---

## Task 6: Client — workspace statistics page + core wiring

**Files:**
- Create: `apps/client/src/ee/statistics/pages/workspace-statistics.tsx`
- Modify: `apps/client/src/components/settings/settings-sidebar.tsx:19,84` (add icon import + one nav data item)
- Modify: `apps/client/src/App.tsx:42,132` (add page import + one route)

**Interfaces:**
- Consumes: `StatCard`, `TrendChart`, `TopContributors`, `formatBytes` from Task 5; `useWorkspaceStatisticsQuery`, `useWorkspaceTopContributorsQuery` from Task 4; `useHasFeature` from `@/ee/hooks/use-feature`; `Feature` from `@/ee/features`.

- [ ] **Step 1: Create the workspace statistics page**

Create `apps/client/src/ee/statistics/pages/workspace-statistics.tsx`:

```tsx
import { useState } from "react";
import { Grid } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  IconFiles,
  IconUsers,
  IconUserCheck,
  IconSpaces,
  IconDatabase,
  IconUserOff,
} from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import StatCard from "@/ee/statistics/components/stat-card";
import TrendChart from "@/ee/statistics/components/trend-chart";
import TopContributors from "@/ee/statistics/components/top-contributors";
import {
  useWorkspaceStatisticsQuery,
  useWorkspaceTopContributorsQuery,
} from "@/ee/statistics/queries/statistics-query";
import { StatsPeriod } from "@/ee/statistics/types/statistics.types";
import { formatBytes } from "@/ee/statistics/lib/format-bytes";

export default function WorkspaceStatistics() {
  const { t } = useTranslation();
  const hasStatistics = useHasFeature(Feature.STATISTICS);
  const { data: stats, isLoading } =
    useWorkspaceStatisticsQuery(hasStatistics);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data: contributors, isLoading: contributorsLoading } =
    useWorkspaceTopContributorsQuery(period, hasStatistics);

  if (!hasStatistics) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>
          {t("Statistics")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Statistics")} />

      <Grid mt="md">
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Total pages")}
            value={stats?.totalPages ?? (isLoading ? "…" : 0)}
            icon={IconFiles}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Total users")}
            value={stats?.totalUsers ?? (isLoading ? "…" : 0)}
            icon={IconUsers}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Active users")}
            value={stats?.totalActiveUsers ?? (isLoading ? "…" : 0)}
            icon={IconUserCheck}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Total spaces")}
            value={stats?.totalSpaces ?? (isLoading ? "…" : 0)}
            icon={IconSpaces}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Storage used")}
            value={formatBytes(stats?.storageUsedBytes ?? 0)}
            icon={IconDatabase}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <StatCard
            label={t("Never logged in")}
            value={stats?.usersNeverLoggedIn ?? (isLoading ? "…" : 0)}
            icon={IconUserOff}
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            title={t("Pages created per week")}
            data={stats?.pagesCreatedByWeek ?? []}
            seriesName={t("Pages")}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart
            title={t("Users joined per week")}
            data={stats?.usersJoinedByWeek ?? []}
            seriesName={t("Users")}
            color="teal.6"
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={12}>
          <TopContributors
            data={contributors}
            isLoading={contributorsLoading}
            period={period}
            onPeriodChange={setPeriod}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
```

- [ ] **Step 2: Wire the route into `App.tsx`**

Edit `apps/client/src/App.tsx`. Add the import near the other `ee/` page imports (next to the `AuditLogs` import at line 42):

```tsx
import AuditLogs from "@/ee/audit/pages/audit-logs.tsx";
import WorkspaceStatistics from "@/ee/statistics/pages/workspace-statistics.tsx";
```

Add the route next to the `audit` route (line 132):

```tsx
            <Route path={"audit"} element={<AuditLogs />} />
            <Route path={"statistics"} element={<WorkspaceStatistics />} />
```

- [ ] **Step 3: Wire the nav entry into `settings-sidebar.tsx`**

Edit `apps/client/src/components/settings/settings-sidebar.tsx`. Add an icon to the `@tabler/icons-react` import (next to `IconHistory`):

```tsx
  IconHistory,
  IconChartBar,
```

Add a data item to the `Workspace` group's `items` array, right after the `"Audit log"` entry:

```tsx
      {
        label: "Audit log",
        icon: IconHistory,
        path: "/settings/audit",
        feature: Feature.AUDIT_LOGS,
        role: "owner",
        env: "selfhosted",
      },
      {
        label: "Statistics",
        icon: IconChartBar,
        path: "/settings/statistics",
        feature: Feature.STATISTICS,
        role: "admin",
      },
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/ee/statistics/pages apps/client/src/App.tsx \
  apps/client/src/components/settings/settings-sidebar.tsx
git commit -m "feat(statistics): add workspace statistics page and wire into settings nav/routes"
```

---

## Task 7: Client — space statistics tab + core wiring

**Files:**
- Create: `apps/client/src/ee/statistics/components/space-statistics.tsx`
- Modify: `apps/client/src/features/space/components/settings-modal.tsx`

**Interfaces:**
- Consumes: `StatCard`, `TopContributors` from Task 5; `useSpaceStatisticsQuery`, `useSpaceTopContributorsQuery` from Task 4; `useHasFeature`/`Feature` (client, from Task 4); existing `useSpaceAbility`, `SpaceCaslAction`, `SpaceCaslSubject` already imported in `settings-modal.tsx`.

- [ ] **Step 1: Create the space statistics panel component**

Create `apps/client/src/ee/statistics/components/space-statistics.tsx`:

```tsx
import { useState } from "react";
import { Grid } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconFiles, IconUsers, IconActivity } from "@tabler/icons-react";
import StatCard from "@/ee/statistics/components/stat-card";
import TopContributors from "@/ee/statistics/components/top-contributors";
import {
  useSpaceStatisticsQuery,
  useSpaceTopContributorsQuery,
} from "@/ee/statistics/queries/statistics-query";
import { StatsPeriod } from "@/ee/statistics/types/statistics.types";

interface SpaceStatisticsProps {
  spaceId: string;
}

export default function SpaceStatistics({ spaceId }: SpaceStatisticsProps) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useSpaceStatisticsQuery(spaceId, true);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const { data: contributors, isLoading: contributorsLoading } =
    useSpaceTopContributorsQuery(spaceId, period, true);

  return (
    <>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Total pages")}
            value={stats?.totalPages ?? (isLoading ? "…" : 0)}
            icon={IconFiles}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Members")}
            value={stats?.totalMembers ?? (isLoading ? "…" : 0)}
            icon={IconUsers}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <StatCard
            label={t("Updated (7 days)")}
            value={stats?.pagesUpdatedLast7Days ?? (isLoading ? "…" : 0)}
            icon={IconActivity}
          />
        </Grid.Col>
      </Grid>

      <Grid mt="md">
        <Grid.Col span={12}>
          <TopContributors
            data={contributors}
            isLoading={contributorsLoading}
            period={period}
            onPeriodChange={setPeriod}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
```

- [ ] **Step 2: Wire the tab into `SpaceSettingsModal`**

Edit `apps/client/src/features/space/components/settings-modal.tsx`. Add imports (next to the existing feature-related imports):

```tsx
import SpaceStatistics from "@/ee/statistics/components/space-statistics.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
```

Inside the `SpaceSettingsModal` component, add the feature-flag check next to `spaceAbility`:

```tsx
  const spaceAbility = useSpaceAbility(spaceRules);
  const hasStatistics = useHasFeature(Feature.STATISTICS);
```

In `<Tabs.List>`, add a tab after the existing `"security"` tab (same gating condition — space admin — plus the feature flag):

```tsx
                  {spaceAbility.can(
                    SpaceCaslAction.Manage,
                    SpaceCaslSubject.Settings,
                  ) && (
                    <Tabs.Tab fw={500} value="security">
                      {t("Security")}
                    </Tabs.Tab>
                  )}
                  {hasStatistics &&
                    spaceAbility.can(
                      SpaceCaslAction.Manage,
                      SpaceCaslSubject.Settings,
                    ) && (
                      <Tabs.Tab fw={500} value="statistics">
                        {t("Statistics")}
                      </Tabs.Tab>
                    )}
```

After the `"security"` `<Tabs.Panel>`, add the matching panel:

```tsx
                <Tabs.Panel value="statistics">
                  <ScrollArea h={580} scrollbarSize={5} pr={8}>
                    <div style={{ paddingBottom: "100px" }}>
                      <SpaceStatistics spaceId={space?.id} />
                    </div>
                  </ScrollArea>
                </Tabs.Panel>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/ee/statistics/components/space-statistics.tsx \
  apps/client/src/features/space/components/settings-modal.tsx
git commit -m "feat(statistics): add space statistics tab to SpaceSettingsModal"
```

---

## Task 8: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: both `apps/server` and `apps/client` build without errors.

- [ ] **Step 2: Start the app locally**

Ensure `apps/server/.env` is configured with `DATABASE_URL`, `REDIS_URL`, `APP_SECRET`, and `UNLOCK_EE=true` (see the project's `.env.example`), and Postgres/Redis are running (`docker compose up -d db redis`). Then run:

Run: `pnpm dev`
Expected: client on `http://localhost:5173`, server API reachable through the Vite proxy (no 502s in the network tab).

- [ ] **Step 3: Verify workspace statistics as a workspace admin**

In the browser: log in as an admin/owner, open the avatar menu → confirm no direct link is needed (feature lives in Settings), go to `/settings/workspace` sidebar, click **Statistics** (`/settings/statistics`). Confirm:
- The 6 stat cards render with real numbers (total pages, total users, active users, total spaces, storage used, never logged in).
- The two trend charts render (may be empty/flat if the test workspace is new — create a page or two and reload to see the current week's bucket increment).
- The Top Contributors leaderboard renders, and switching the Week/Month/Year segmented control changes the results.

- [ ] **Step 4: Verify space statistics as a space admin**

Open a space, open its settings modal (via the space's context menu → "Space settings" or the Spaces list), confirm a **Statistics** tab appears (only when the current user is a space admin), and that it shows total pages, member count, pages updated in the last 7 days, and its own Top Contributors leaderboard scoped to that space only.

- [ ] **Step 5: Verify non-admin users don't see the tabs**

Log in as (or switch to) a plain member (not workspace admin, not space admin of the given space). Confirm the "Statistics" entry is absent from the workspace settings sidebar, and the space settings modal has no "Statistics" tab for a space where this user isn't an admin.

- [ ] **Step 6: Run full test suites one more time**

Run: `pnpm --filter ./apps/server run test`
Run: `cd apps/client && pnpm exec vitest run`
Expected: both PASS.
