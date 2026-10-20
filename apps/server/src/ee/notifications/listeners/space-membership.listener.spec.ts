import { SpaceMembershipNotificationListener } from './space-membership.listener';

function createListener() {
  const recipientsRepo = {
    findUserIdsByGroupIds: jest.fn().mockResolvedValue(['group-user']),
    findSpaceContext: jest.fn().mockResolvedValue({
      id: 'space-1',
      slug: 'space',
      name: 'Space',
      workspaceId: 'workspace-1',
    }),
    findUserNames: jest
      .fn()
      .mockResolvedValue(new Map([['actor-1', 'Alice']])),
    findWorkspaceHostname: jest.fn().mockResolvedValue('docs.example.com'),
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(1) };
  const domainService = {
    getUrl: jest.fn((hostname?: string) => `https://${hostname}`),
  };

  const spaceMemberRepo = {
    getUserIdsWithSpaceAccess: jest.fn().mockResolvedValue(new Set<string>()),
  };

  const listener = new SpaceMembershipNotificationListener(
    recipientsRepo as any,
    dispatcher as any,
    domainService as any,
    spaceMemberRepo as any,
  );

  return { listener, recipientsRepo, dispatcher, spaceMemberRepo };
}

describe('SpaceMembershipNotificationListener', () => {
  it('resolves group members and excludes the actor', async () => {
    const { listener, dispatcher } = createListener();

    await listener.handleMemberAdded({
      userIds: ['user-1', 'actor-1'],
      groupIds: ['group-1'],
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
      actorId: 'actor-1',
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'space.member_added',
        userIds: ['user-1', 'group-user'],
        spaceId: 'space-1',
      }),
    );
  });

  it('keeps removed-member notifications visible after access is lost', async () => {
    const { listener, dispatcher } = createListener();

    await listener.handleMemberRemoved({
      userIds: ['user-1'],
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'space.member_removed',
        spaceId: null,
      }),
    );
  });

  it('does not notify removed users who still have space access', async () => {
    const { listener, dispatcher, spaceMemberRepo } = createListener();
    spaceMemberRepo.getUserIdsWithSpaceAccess.mockResolvedValue(
      new Set(['user-1']),
    );

    await listener.handleMemberRemoved({
      userIds: ['user-1', 'user-2'],
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['user-2', 'group-user'] }),
    );
  });
});
