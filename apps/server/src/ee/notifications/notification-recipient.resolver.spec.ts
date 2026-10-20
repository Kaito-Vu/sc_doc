import { NotificationRecipientResolver } from './notification-recipient.resolver';

function createResolver(overrides: {
  watchers?: string[];
  explicit?: string[];
  verifiers?: string[];
  connected?: string[];
  spaceAccess?: string[];
  pageAccess?: string[];
} = {}) {
  const watcherRepo = {
    getPageUpdateRecipientIds: jest.fn().mockResolvedValue(
      overrides.watchers ?? ['watcher-1', 'watcher-2'],
    ),
  };
  const recipientsRepo = {
    findExplicitPagePermissionUserIds: jest
      .fn()
      .mockResolvedValue(overrides.explicit ?? ['explicit-1']),
    findVerifierUserIds: jest
      .fn()
      .mockResolvedValue(overrides.verifiers ?? ['verifier-1']),
    findMutedPageWatcherIds: jest.fn().mockResolvedValue([]),
  };
  const spaceMemberRepo = {
    getUserIdsWithSpaceAccess: jest
      .fn()
      .mockImplementation(async (ids: string[]) => {
        const allowed = new Set(overrides.spaceAccess ?? ids);
        return new Set(ids.filter((id) => allowed.has(id)));
      }),
  };
  const pagePermissionRepo = {
    getUserIdsWithPageAccess: jest
      .fn()
      .mockImplementation(async (_pageId: string, ids: string[]) => {
        const allowed = new Set(overrides.pageAccess ?? ids);
        return ids.filter((id) => allowed.has(id));
      }),
  };
  const collaborationGateway = {
    handleYjsEvent: jest
      .fn()
      .mockResolvedValue(overrides.connected ?? []),
  };

  const resolver = new NotificationRecipientResolver(
    watcherRepo as any,
    spaceMemberRepo as any,
    pagePermissionRepo as any,
    recipientsRepo as any,
    collaborationGateway as any,
  );

  return { resolver, watcherRepo, recipientsRepo };
}

describe('NotificationRecipientResolver', () => {
  it('combines watchers, explicit page permissions and verifiers', async () => {
    const { resolver } = createResolver();

    const recipients = await resolver.resolvePageRecipients({
      pageId: 'page-1',
      spaceId: 'space-1',
      includeVerifiers: true,
    });

    expect(recipients).toEqual(
      expect.arrayContaining(['watcher-1', 'watcher-2', 'explicit-1', 'verifier-1']),
    );
  });

  it('excludes actors, watchers (when requested) and connected users', async () => {
    const { resolver } = createResolver({
      connected: ['explicit-1'],
    });

    const recipients = await resolver.resolvePageRecipients({
      pageId: 'page-1',
      spaceId: 'space-1',
      actorIds: ['watcher-1'],
      includeWatchers: false,
      excludeWatchers: true,
      excludeConnected: true,
    });

    expect(recipients).toEqual([]);
  });

  it('filters candidates who lost space or page access', async () => {
    const { resolver } = createResolver({
      spaceAccess: ['watcher-1'],
      pageAccess: ['watcher-1'],
    });

    const recipients = await resolver.resolvePageRecipients({
      pageId: 'page-1',
      spaceId: 'space-1',
      includeVerifiers: true,
    });

    expect(recipients).toEqual(['watcher-1']);
  });
});
