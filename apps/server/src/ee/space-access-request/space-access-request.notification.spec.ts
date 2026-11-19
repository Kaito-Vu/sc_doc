import { SpaceAccessRequestNotification } from './space-access-request.notification';
import { NotificationType } from '../../core/notification/notification.constants';

const request = (over: any = {}) => ({
  id: 'r1',
  workspaceId: 'w1',
  spaceId: 's1',
  requesterId: 'req',
  reviewerId: 'rev',
  status: 'pending',
  roleRequested: 'writer',
  message: 'pls',
  decisionReason: null,
  ...over,
});

function build(req: any, approverIds: string[] = []) {
  const del = {
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const db: any = { deleteFrom: jest.fn().mockReturnValue(del) };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const repo = { findById: jest.fn().mockResolvedValue(req) };
  const service = { getApproverIds: jest.fn().mockResolvedValue(approverIds) };
  const n = new SpaceAccessRequestNotification(
    db, notifications as any, repo as any, service as any,
  );
  return { n, db, del, notifications };
}

const job = { requestId: 'r1', spaceId: 's1', workspaceId: 'w1' };

describe('SpaceAccessRequestNotification', () => {
  it('requested notifies each approver once, never the requester', async () => {
    const { n, notifications } = build(request(), ['a1', 'a2', 'req']);
    await n.processRequested(job);
    const ids = notifications.create.mock.calls.map((c) => c[0].userId);
    expect(ids).toEqual(['a1', 'a2']);
    expect(notifications.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: NotificationType.SPACE_ACCESS_REQUESTED,
        actorId: 'req',
        data: expect.objectContaining({ requestId: 'r1', role: 'writer' }),
      }),
    );
  });

  it('requested does nothing if the request is no longer pending', async () => {
    const { n, notifications } = build(request({ status: 'cancelled' }), ['a1']);
    await n.processRequested(job);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('decided clears approvers pending notifications', async () => {
    const { n, db, del } = build(request({ status: 'approved' }));
    await n.processDecided(job);
    expect(db.deleteFrom).toHaveBeenCalledWith('notifications');
    expect(del.where).toHaveBeenCalledWith('type', '=', NotificationType.SPACE_ACCESS_REQUESTED);
    expect(del.execute).toHaveBeenCalled();
  });

  it('rejected notifies the requester with the reason', async () => {
    const { n, notifications } = build(request({ status: 'rejected', decisionReason: 'no' }));
    await n.processDecided(job);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'req',
        type: NotificationType.SPACE_ACCESS_DECIDED,
        data: expect.objectContaining({ status: 'rejected', reason: 'no' }),
      }),
    );
  });

  it('approved sends no duplicate notification (member_added listener covers it)', async () => {
    const { n, notifications } = build(request({ status: 'approved' }));
    await n.processDecided(job);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
