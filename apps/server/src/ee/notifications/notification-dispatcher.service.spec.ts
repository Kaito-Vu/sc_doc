import { NotificationDispatcher } from './notification-dispatcher.service';

function createDb(users: unknown[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(users),
  };

  return {
    selectFrom: jest.fn().mockReturnValue(query),
  };
}

describe('NotificationDispatcher', () => {
  const notificationRepo = {
    getRecentlyNotifiedUserIds: jest.fn(),
  };
  const notificationService = {
    create: jest.fn(),
    queueEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    notificationRepo.getRecentlyNotifiedUserIds.mockResolvedValue(new Set());
    notificationService.create.mockImplementation(async (data) => ({
      id: 'n1',
      ...data,
    }));
    notificationService.queueEmail.mockResolvedValue(undefined);
  });

  it('skips users already notified within the cooldown window', async () => {
    const db = createDb([
      { id: 'u1', name: 'One', email: 'u1@example.com', settings: {} },
      { id: 'u2', name: 'Two', email: 'u2@example.com', settings: {} },
    ]);
    notificationRepo.getRecentlyNotifiedUserIds.mockResolvedValue(
      new Set(['u1']),
    );
    const dispatcher = new NotificationDispatcher(
      db as any,
      notificationRepo as any,
      notificationService as any,
    );

    const created = await dispatcher.dispatch({
      userIds: ['u1', 'u2'],
      type: 'page.updated',
      workspaceId: 'w1',
      pageId: 'page-1',
      cooldownHours: 0.25,
    });

    expect(created).toBe(1);
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2' }),
    );
  });

  it('queues an email only for recipients that received a notification', async () => {
    const db = createDb([
      { id: 'u1', name: 'One', email: 'u1@example.com', settings: {} },
    ]);
    const dispatcher = new NotificationDispatcher(
      db as any,
      notificationRepo as any,
      notificationService as any,
    );

    await dispatcher.dispatch({
      userIds: ['u1'],
      type: 'page.created',
      workspaceId: 'w1',
      email: () => ({ subject: 'Subject', template: 'template' }),
    });

    expect(notificationService.queueEmail).toHaveBeenCalledWith(
      'u1',
      'n1',
      'Subject',
      'template',
    );
  });

  it('does not create notifications for inactive users', async () => {
    const db = createDb([]);
    const dispatcher = new NotificationDispatcher(
      db as any,
      notificationRepo as any,
      notificationService as any,
    );

    const created = await dispatcher.dispatch({
      userIds: ['u1'],
      type: 'page.created',
      workspaceId: 'w1',
    });

    expect(created).toBe(0);
    expect(notificationService.create).not.toHaveBeenCalled();
  });
});
