import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  REREQUEST_COOLDOWN_MS,
  SpaceAccessRequestService,
} from './space-access-request.service';
import { QueueJob } from '../../integrations/queue/constants';

const trx = {};
const user = (over: any = {}) => ({
  id: 'u1',
  workspaceId: 'w1',
  role: 'member',
  ...over,
});
const pendingRow = (over: any = {}) => ({
  id: 'r1',
  workspaceId: 'w1',
  spaceId: 's1',
  requesterId: 'u2',
  status: 'pending',
  roleRequested: 'reader',
  ...over,
});

function build(over: { repo?: any; members?: any } = {}) {
  const repo = {
    findPendingForSpaceAndUser: jest.fn().mockResolvedValue(undefined),
    findLatestForSpaceAndUser: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue({ id: 'r1' }),
    findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow()),
    decide: jest.fn().mockResolvedValue(undefined),
    ...over.repo,
  };
  const spaceRepo = { findById: jest.fn().mockResolvedValue({ id: 's1' }) };
  const members = {
    getUserSpaceRoles: jest.fn().mockResolvedValue(undefined),
    getSpaceMemberByTypeId: jest.fn().mockResolvedValue(undefined),
    insertSpaceMember: jest.fn().mockResolvedValue(undefined),
    ...over.members,
  };
  const db: any = {
    transaction: () => ({ execute: (cb: any) => cb(trx) }),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new SpaceAccessRequestService(
    repo as any, spaceRepo as any, members as any, db, queue as any,
    events as any, audit as any,
  );
  return { svc, repo, members, queue, events, audit };
}

describe('SpaceAccessRequestService.create', () => {
  it('throws BadRequest if user already has access', async () => {
    const { svc } = build({
      members: { getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'reader' }]) },
    });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Conflict if a pending request exists', async () => {
    const { svc } = build({
      repo: { findPendingForSpaceAndUser: jest.fn().mockResolvedValue({ id: 'x' }) },
    });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequest within 24h of a rejection', async () => {
    const { svc } = build({
      repo: {
        findLatestForSpaceAndUser: jest.fn().mockResolvedValue({
          status: 'rejected',
          decidedAt: new Date(Date.now() - REREQUEST_COOLDOWN_MS / 2),
        }),
      },
    });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a new request after the cooldown', async () => {
    const { svc, repo } = build({
      repo: {
        findLatestForSpaceAndUser: jest.fn().mockResolvedValue({
          status: 'rejected',
          decidedAt: new Date(Date.now() - REREQUEST_COOLDOWN_MS - 1000),
        }),
      },
    });
    await svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any);
    expect(repo.insert).toHaveBeenCalled();
  });

  it('maps a unique-violation race to Conflict', async () => {
    const { svc } = build({
      repo: { insert: jest.fn().mockRejectedValue({ code: '23505' }) },
    });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('inserts and enqueues SPACE_ACCESS_REQUESTED', async () => {
    const { svc, repo, queue } = build();
    await svc.create({ spaceId: 's1', role: 'writer' as any, message: ' hi ' }, user() as any);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ roleRequested: 'writer', message: 'hi', requesterId: 'u1' }),
    );
    expect(queue.add).toHaveBeenCalledWith(QueueJob.SPACE_ACCESS_REQUESTED, expect.objectContaining({ requestId: 'r1' }));
  });
});

describe('SpaceAccessRequestService.approve', () => {
  const admin = user({ id: 'a1', role: 'admin' });

  it('grants the (possibly different) role and marks approved in the trx', async () => {
    const { svc, members, repo, events } = build();
    await svc.approve('r1', 'writer' as any, admin as any);
    expect(members.insertSpaceMember).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 's1', userId: 'u2', role: 'writer', addedById: 'a1' }),
      trx,
    );
    expect(repo.decide).toHaveBeenCalledWith('r1', trx, expect.objectContaining({ status: 'approved', roleGranted: 'writer', reviewerId: 'a1' }));
    expect(events.emit).toHaveBeenCalled();
  });

  it('does not insert a duplicate member when requester became a member meanwhile', async () => {
    const { svc, members, repo } = build({
      members: { getSpaceMemberByTypeId: jest.fn().mockResolvedValue({ id: 'm' }) },
    });
    await svc.approve('r1', 'reader' as any, admin as any);
    expect(members.insertSpaceMember).not.toHaveBeenCalled();
    expect(repo.decide).toHaveBeenCalled();
  });

  it('throws Forbidden for a caller who is not an approver (e.g. demoted admin)', async () => {
    const { svc, repo } = build({
      members: { getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'writer' }]) },
    });
    await expect(svc.approve('r1', 'reader' as any, user() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('lets a space Full-access member approve', async () => {
    const { svc, repo } = build({
      members: { getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'admin' }]) },
    });
    await svc.approve('r1', 'reader' as any, user() as any);
    expect(repo.decide).toHaveBeenCalled();
  });

  it.each(['approved', 'rejected', 'cancelled'])(
    'throws Conflict when status is %s (concurrent decision or withdrawn)',
    async (status) => {
      const { svc, members, repo } = build({
        repo: { findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow({ status })) },
      });
      await expect(svc.approve('r1', 'reader' as any, admin as any))
        .rejects.toBeInstanceOf(ConflictException);
      expect(members.insertSpaceMember).not.toHaveBeenCalled();
      expect(repo.decide).not.toHaveBeenCalled();
    },
  );
});

describe('SpaceAccessRequestService.reject / cancel', () => {
  it('reject stores reason and enqueues SPACE_ACCESS_DECIDED', async () => {
    const { svc, repo, queue } = build();
    await svc.reject('r1', ' no ', user({ role: 'owner' }) as any);
    expect(repo.decide).toHaveBeenCalledWith('r1', trx, expect.objectContaining({ status: 'rejected', decisionReason: 'no' }));
    expect(queue.add).toHaveBeenCalledWith(QueueJob.SPACE_ACCESS_DECIDED, expect.anything());
  });

  it('cancel works only for the requester', async () => {
    const { svc, repo } = build({
      repo: { findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow({ requesterId: 'someone-else' })) },
    });
    await expect(svc.cancel('r1', user() as any)).rejects.toThrow();
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('cancel throws Conflict if not pending', async () => {
    const { svc } = build({
      repo: { findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow({ requesterId: 'u1', status: 'approved' })) },
    });
    await expect(svc.cancel('r1', user() as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancel marks cancelled for the requester', async () => {
    const { svc, repo } = build({
      repo: { findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow({ requesterId: 'u1' })) },
    });
    await svc.cancel('r1', user() as any);
    expect(repo.decide).toHaveBeenCalledWith('r1', trx, { status: 'cancelled' });
  });
});
