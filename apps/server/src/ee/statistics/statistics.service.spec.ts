import { BadRequestException } from '@nestjs/common';
import {
  StatisticsService,
  summarizeVerification,
} from './statistics.service';

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

  describe('month range', () => {
    afterEach(() => jest.useRealTimers());

    it('defaults to the current Vietnam-time month as [since, until)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-18T10:00:00Z'));
      pageRepo.countCreatedByUserSince.mockResolvedValue([]);
      pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);

      await service.getTopContributors({ workspaceId: 'ws1' });

      const arg = pageRepo.countCreatedByUserSince.mock.calls[0][0];
      expect(arg.since.toISOString()).toBe('2026-10-31T17:00:00.000Z');
      expect(arg.until.toISOString()).toBe('2026-11-30T17:00:00.000Z');
      expect(pageHistoryRepo.countEditsByUserSince.mock.calls[0][0]).toMatchObject(
        { since: arg.since, until: arg.until },
      );
    });

    it('uses an explicit past month', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-18T10:00:00Z'));
      pageRepo.countCreatedByUserSince.mockResolvedValue([]);
      pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);

      await service.getTopContributors({ workspaceId: 'ws1' }, '2026-02');

      const arg = pageRepo.countCreatedByUserSince.mock.calls[0][0];
      expect(arg.since.toISOString()).toBe('2026-01-31T17:00:00.000Z');
      expect(arg.until.toISOString()).toBe('2026-02-28T17:00:00.000Z');
    });

    it('rejects future, too-old and malformed months', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-18T10:00:00Z'));
      for (const bad of ['2026-12', '2020-10', '2026-13', 'nope']) {
        await expect(
          service.getTopContributors({ workspaceId: 'ws1' }, bad),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(pageRepo.countCreatedByUserSince).not.toHaveBeenCalled();
    });
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
    );

    expect(result).toHaveLength(10);
    expect(result[0].userId).toBe('u14');
  });

  it('passes spaceId through to both repo calls when scoped to a space', async () => {
    pageRepo.countCreatedByUserSince.mockResolvedValue([]);
    pageHistoryRepo.countEditsByUserSince.mockResolvedValue([]);

    await service.getTopContributors(
      { workspaceId: 'ws1', spaceId: 'sp1' },
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
    const now = new Date();
    const dayOfWeek = (now.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
    const currentWeekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - dayOfWeek,
      ),
    );

    const pageRepo = {
      countByWorkspaceId: jest.fn().mockResolvedValue(42),
      countCreatedByWeek: jest
        .fn()
        .mockResolvedValue([{ weekStart: currentWeekStart, count: 3 }]),
    };
    const userRepo = {
      countByWorkspaceId: jest.fn().mockResolvedValue(10),
      countActiveByWorkspaceId: jest.fn().mockResolvedValue(8),
      countNeverLoggedInByWorkspaceId: jest.fn().mockResolvedValue(2),
      countJoinedByWeek: jest
        .fn()
        .mockResolvedValue([{ weekStart: currentWeekStart, count: 1 }]),
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
      {} as any,
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
    expect(result.pagesCreatedByWeek).toHaveLength(12);
    expect(result.usersJoinedByWeek).toHaveLength(12);
    expect(result.pagesCreatedByWeek[11].count).toBe(3);
    expect(result.usersJoinedByWeek[11].count).toBe(1);
    expect(
      result.pagesCreatedByWeek.slice(0, 11).every((w) => w.count === 0),
    ).toBe(true);
    expect(
      result.usersJoinedByWeek.slice(0, 11).every((w) => w.count === 0),
    ).toBe(true);
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
      {} as any,
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

describe('summarizeVerification', () => {
  it('folds rows into per-type status maps and a total', () => {
    expect(
      summarizeVerification([
        { type: 'expiring', status: 'verified', count: 4 },
        { type: 'expiring', status: 'expired', count: 2 },
        { type: 'qms', status: 'approved', count: 3 },
        { type: 'qms', status: 'approved', count: 1 },
      ]),
    ).toEqual({
      expiring: { verified: 4, expired: 2 },
      qms: { approved: 4 },
      total: 10,
    });
  });
});

describe('StatisticsService extra stats', () => {
  it('getWorkspaceExtra builds a dense 12-month trend and passes through aggregates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const queries = {
      pagesCreatedByMonth: jest
        .fn()
        .mockResolvedValue([{ month: '2026-11', count: 3 }]),
      usersJoinedByMonth: jest.fn().mockResolvedValue([]),
      editsByMonth: jest.fn().mockResolvedValue({
        edits: [{ month: '2026-10', count: 9 }],
        editors: [{ month: '2026-10', count: 2 }],
      }),
      activeUsers: jest.fn().mockResolvedValue({ last7Days: 1, last30Days: 2 }),
      stalePages: jest
        .fn()
        .mockResolvedValue({ over90Days: 5, over180Days: 1 }),
      verificationStatusCounts: jest
        .fn()
        .mockResolvedValue([{ type: 'expiring', status: 'expired', count: 2 }]),
      comments: jest
        .fn()
        .mockResolvedValue({ createdInMonth: 7, unresolved: 4 }),
    };
    const service = new StatisticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queries as any,
    );

    const res = await service.getWorkspaceExtra('ws-extra-test');
    jest.useRealTimers();

    expect(res.monthlyTrend).toHaveLength(12);
    expect(res.monthlyTrend[0].month).toBe('2025-12');
    expect(res.monthlyTrend[11]).toEqual({
      month: '2026-11',
      pagesCreated: 3,
      activeEditors: 0,
      newUsers: 0,
      edits: 0,
    });
    expect(res.monthlyTrend[10]).toMatchObject({ edits: 9, activeEditors: 2 });
    expect(res.comments).toEqual({ createdThisMonth: 7, unresolved: 4 });
    expect(res.verification.expiring.expired).toBe(2);
    expect(res.stalePages.over90Days).toBe(5);
  });

  it('getSpacesRanking merges edits and member counts into the by-pages list', async () => {
    const queries = {
      topSpacesByPages: jest
        .fn()
        .mockResolvedValue([{ spaceId: 's1', name: 'A', slug: 'a', value: 10 }]),
      topSpacesByStorage: jest.fn().mockResolvedValue([]),
      topSpacesByStale: jest.fn().mockResolvedValue([]),
      editsBySpace: jest.fn().mockResolvedValue(new Map([['s1', 6]])),
      memberCounts: jest.fn().mockResolvedValue(new Map([['s1', 3]])),
    };
    const service = new StatisticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queries as any,
    );
    const res = await service.getSpacesRanking('ws-rank-test');
    expect(res.byPages).toEqual([
      {
        spaceId: 's1',
        name: 'A',
        slug: 'a',
        value: 10,
        editsThisMonth: 6,
        memberCount: 3,
      },
    ]);
  });

  it('getSpaceOverview validates the month before querying', async () => {
    const queries = { spaceMonthActivity: jest.fn() };
    const service = new StatisticsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queries as any,
    );
    expect(() => service.getSpaceOverview('sp', 'ws', '2999-01')).toThrow(
      BadRequestException,
    );
    expect(queries.spaceMonthActivity).not.toHaveBeenCalled();
  });
});
