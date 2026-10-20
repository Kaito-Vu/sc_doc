import { PageEditSupplementService } from './page-edit-supplement.service';
import { NotificationType } from '../../core/notification/notification.constants';

const context = {
  id: 'page-1',
  title: 'Page one',
  slugId: 'slug-1',
  spaceId: 'space-1',
  workspaceId: 'workspace-1',
  creatorId: 'user-1',
  deletedById: null,
  spaceSlug: 'space',
  spaceName: 'Space',
};

function createService(options?: {
  recipients?: string[];
  contexts?: unknown[];
}) {
  const recipientsRepo = {
    findPageContexts: jest
      .fn()
      .mockResolvedValue(options?.contexts ?? [context]),
    findUserNames: jest
      .fn()
      .mockResolvedValue(new Map([['user-1', 'Alice']])),
  };
  const recipientResolver = {
    resolvePageRecipients: jest
      .fn()
      .mockResolvedValue(options?.recipients ?? ['user-2']),
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(1) };

  const service = new PageEditSupplementService(
    recipientsRepo as any,
    recipientResolver as any,
    dispatcher as any,
  );

  return { service, recipientsRepo, recipientResolver, dispatcher };
}

describe('PageEditSupplementService', () => {
  it('notifies explicit page users and verifiers without duplicating watchers', async () => {
    const { service, recipientResolver, dispatcher } = createService();

    await service.process(
      {
        pageId: 'page-1',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        actorIds: ['user-1'],
      },
      'https://docs.example.com',
    );

    expect(recipientResolver.resolvePageRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        includeWatchers: false,
        excludeWatchers: true,
        includeExplicitPermission: true,
        includeVerifiers: true,
        excludeConnected: true,
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.PAGE_UPDATED,
        pageId: 'page-1',
        actorId: 'user-1',
        userIds: ['user-2'],
      }),
    );
  });

  it('does nothing when there are no contributors', async () => {
    const { service, recipientsRepo, dispatcher } = createService();

    await service.process(
      {
        pageId: 'page-1',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        actorIds: [],
      },
      'https://docs.example.com',
    );

    expect(recipientsRepo.findPageContexts).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the page context is gone', async () => {
    const { service, dispatcher } = createService({ contexts: [] });

    await service.process(
      {
        pageId: 'page-missing',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        actorIds: ['user-1'],
      },
      'https://docs.example.com',
    );

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
