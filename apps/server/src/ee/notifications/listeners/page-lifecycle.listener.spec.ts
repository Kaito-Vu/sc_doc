import { PageLifecycleNotificationListener } from './page-lifecycle.listener';

const context = {
  id: 'page-1',
  title: 'Page one',
  slugId: 'slug-1',
  spaceId: 'space-1',
  workspaceId: 'workspace-1',
  parentPageId: null,
  creatorId: 'user-1',
  deletedById: null,
  spaceSlug: 'space',
  spaceName: 'Space',
};

function createListener(options?: {
  contexts?: unknown[];
  recipients?: string[];
  hostname?: string;
}) {
  const recipientsRepo = {
    findPageContexts: jest
      .fn()
      .mockResolvedValue(options?.contexts ?? [context]),
    findWorkspaceHostname: jest
      .fn()
      .mockResolvedValue(options?.hostname ?? 'docs.example.com'),
    findUserNames: jest
      .fn()
      .mockResolvedValue(new Map([['user-1', 'Alice']])),
  };
  const recipientResolver = {
    resolvePageRecipients: jest
      .fn()
      .mockResolvedValue(options?.recipients ?? ['user-2']),
  };
  const dispatcher = {
    dispatch: jest.fn().mockResolvedValue(1),
  };
  const domainService = {
    getUrl: jest.fn((hostname?: string) =>
      hostname ? `https://${hostname}` : 'https://app.example.com',
    ),
  };

  const listener = new PageLifecycleNotificationListener(
    recipientsRepo as any,
    recipientResolver as any,
    dispatcher as any,
    domainService as any,
  );

  return { listener, recipientsRepo, recipientResolver, dispatcher };
}

describe('PageLifecycleNotificationListener', () => {
  it('notifies recipients when a page is created', async () => {
    const { listener, dispatcher } = createListener();

    await listener.handlePageCreated({
      pageIds: ['page-1'],
      workspaceId: 'workspace-1',
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'page.created',
        pageId: 'page-1',
        spaceId: 'space-1',
        actorId: 'user-1',
        userIds: ['user-2'],
      }),
    );
  });

  it('skips bulk fan-out above the cap', async () => {
    const pageIds = Array.from({ length: 21 }, (_, index) => `page-${index}`);
    const { listener, recipientsRepo, dispatcher } = createListener({
      contexts: pageIds.map((id) => ({ ...context, id })),
    });

    await listener.handlePageCreated({
      pageIds,
      workspaceId: 'workspace-1',
    });

    expect(recipientsRepo.findPageContexts).toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('notifies once per trashed subtree, not per descendant', async () => {
    const { listener, dispatcher } = createListener({
      contexts: [
        { ...context, id: 'root', parentPageId: 'outside' },
        { ...context, id: 'child', parentPageId: 'root' },
      ],
    });

    await listener.handlePageTrashed({
      pageIds: ['root', 'child'],
      workspaceId: 'workspace-1',
    });

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'root' }),
    );
  });

  it('does nothing when the page context is gone', async () => {
    const { listener, dispatcher } = createListener({ contexts: [] });

    await listener.handlePageRestored({
      pageIds: ['page-missing'],
      workspaceId: 'workspace-1',
    });

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
