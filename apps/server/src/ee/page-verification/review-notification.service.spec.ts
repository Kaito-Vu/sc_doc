jest.mock(
  '../../integrations/transactional/emails/approval-clarification-email',
  () => ({ ApprovalClarificationEmail: jest.fn(() => 'clarification-tpl') }),
  { virtual: true },
);
jest.mock(
  '../../integrations/transactional/emails/reverification-required-email',
  () => ({ ReverificationRequiredEmail: jest.fn(() => 'reverify-tpl') }),
  { virtual: true },
);

import { ReviewNotificationService } from './review-notification.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationType } from '../../core/notification/notification.constants';

describe('ReviewNotificationService', () => {
  const pageCtx = {
    id: 'p1',
    title: 'My Page',
    slugId: 'slug-1',
    spaceSlug: 'space-1',
    spaceName: 'Space One',
  };
  const user = (id: string) => ({ id, name: id, email: `${id}@x.io` });

  const build = (opts: { accessible?: string[]; noPage?: boolean } = {}) => {
    const resolver = {
      filterPageAccessible: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(opts.accessible ?? ids),
        ),
    };
    const recipientsRepo = {
      findPageContexts: jest
        .fn()
        .mockResolvedValue(opts.noPage ? [] : [pageCtx]),
      findUserNames: jest
        .fn()
        .mockResolvedValue(new Map([['reviewer-1', 'Reviewer']])),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue(1) };
    const service = new ReviewNotificationService(
      dispatcher as any,
      resolver as any,
      recipientsRepo as any,
    );
    return { service, dispatcher, resolver, recipientsRepo };
  };

  const clarification = {
    pageId: 'p1',
    spaceId: 's1',
    workspaceId: 'w1',
    actorId: 'reviewer-1',
    requestedById: 'contributor-1',
  };

  it('processApprovalClarification dispatches to the requester with the same payload and email', async () => {
    const { service, dispatcher } = build();
    await service.processApprovalClarification(clarification, 'https://app');

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const arg = dispatcher.dispatch.mock.calls[0][0];
    expect(arg).toMatchObject({
      userIds: ['contributor-1'],
      workspaceId: 'w1',
      type: NotificationType.PAGE_APPROVAL_CLARIFICATION_REQUESTED,
      actorId: 'reviewer-1',
      pageId: 'p1',
      spaceId: 's1',
    });
    expect(arg.cooldownHours).toBeUndefined();
    expect(arg.email(user('contributor-1'))).toEqual({
      subject: 'Clarification requested on "My Page"',
      template: 'clarification-tpl',
    });
  });

  it('processApprovalClarification skips when requester lacks access or page is missing', async () => {
    const a = build({ accessible: [] });
    await a.service.processApprovalClarification(clarification, 'u');
    expect(a.dispatcher.dispatch).not.toHaveBeenCalled();

    const b = build({ noPage: true });
    await b.service.processApprovalClarification(clarification, 'u');
    expect(b.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('processReverificationRequired dispatches once to all accessible verifiers', async () => {
    const { service, dispatcher, resolver } = build({
      accessible: ['verifier-1', 'verifier-2'],
    });
    await service.processReverificationRequired(
      {
        pageId: 'p1',
        spaceId: 's1',
        workspaceId: 'w1',
        verifierIds: ['verifier-1', 'verifier-2', 'verifier-3'],
      },
      'https://app',
    );

    expect(resolver.filterPageAccessible).toHaveBeenCalledWith(
      ['verifier-1', 'verifier-2', 'verifier-3'],
      'p1',
      's1',
    );
    const arg = dispatcher.dispatch.mock.calls[0][0];
    expect(arg).toMatchObject({
      userIds: ['verifier-1', 'verifier-2'],
      type: NotificationType.PAGE_REVERIFICATION_REQUIRED,
      pageId: 'p1',
      spaceId: 's1',
    });
    expect(arg.email(user('verifier-1')).subject).toBe(
      '"My Page" needs to be re-verified',
    );
  });

  it('processReverificationRequired does nothing when there are no verifiers', async () => {
    const { service, dispatcher } = build();
    await service.processReverificationRequired(
      { pageId: 'p1', spaceId: 's1', workspaceId: 'w1', verifierIds: [] },
      'u',
    );
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('one failing recipient does not stop the others (real dispatcher isolation)', async () => {
    const users = ['v1', 'v2', 'v3'].map(user);
    const chain: any = {
      select: () => chain,
      where: () => chain,
      execute: async () => users,
    };
    const db: any = { selectFrom: () => chain };
    const notificationService = {
      create: jest.fn().mockImplementation(async ({ userId }) => {
        if (userId === 'v1') throw new Error('boom');
        return { id: `n-${userId}` };
      }),
      queueEmail: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher = new NotificationDispatcher(
      db,
      {} as any,
      notificationService as any,
    );
    const resolver = { filterPageAccessible: async (ids: string[]) => ids };
    const recipientsRepo = {
      findPageContexts: async () => [pageCtx],
      findUserNames: async () => new Map(),
    };
    const service = new ReviewNotificationService(
      dispatcher,
      resolver as any,
      recipientsRepo as any,
    );

    await expect(
      service.processReverificationRequired(
        {
          pageId: 'p1',
          spaceId: 's1',
          workspaceId: 'w1',
          verifierIds: ['v1', 'v2', 'v3'],
        },
        'https://app',
      ),
    ).resolves.toBeUndefined();

    expect(notificationService.create).toHaveBeenCalledTimes(3);
    expect(notificationService.queueEmail.mock.calls.map((c) => c[0])).toEqual([
      'v2',
      'v3',
    ]);
  });
});
