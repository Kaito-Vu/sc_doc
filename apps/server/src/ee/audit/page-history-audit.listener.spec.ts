import { PageHistoryAuditListener } from './page-history-audit.listener';

const event = (over: any = {}) => ({
  pageId: 'p1',
  spaceId: 's1',
  workspaceId: 'w1',
  historyId: 'h1',
  contributorIds: ['u1', 'u2'],
  title: 'T',
  hadPreviousContent: true,
  ...over,
});

describe('PageHistoryAuditListener', () => {
  const mkDb = (execute = jest.fn().mockResolvedValue(undefined)) => {
    const values = jest.fn(() => ({ execute }));
    return { db: { insertInto: jest.fn(() => ({ values })) }, values, execute };
  };

  it('writes one page.updated audit row attributed to the first contributor', async () => {
    const { db, values } = mkDb();
    await new PageHistoryAuditListener(db as any).handle(event());
    expect(db.insertInto).toHaveBeenCalledWith('audit');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        actorId: 'u1',
        resourceId: 'p1',
        spaceId: 's1',
        changes: { after: { title: 'T' } },
        metadata: {
          source: 'collaboration',
          historyId: 'h1',
          contributorIds: ['u1', 'u2'],
        },
      }),
    );
  });

  it('skips without contributors', async () => {
    const { db } = mkDb();
    await new PageHistoryAuditListener(db as any).handle(
      event({ contributorIds: [] }),
    );
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('never throws when the insert fails', async () => {
    const { db } = mkDb(jest.fn().mockRejectedValue(new Error('x')));
    await expect(
      new PageHistoryAuditListener(db as any).handle(event()),
    ).resolves.toBeUndefined();
  });
});
