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
