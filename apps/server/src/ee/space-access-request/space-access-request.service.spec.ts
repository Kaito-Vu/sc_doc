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
const adminRoles = { getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'admin' }]) };
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

function build(over: { repo?: any; members?: any; enabled?: boolean } = {}) {
  const repo = {
    findPendingForSpaceAndUser: jest.fn().mockResolvedValue(undefined),
    findLatestForSpaceAndUser: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue({ id: 'r1' }),
    findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow()),
    decide: jest.fn().mockResolvedValue(undefined),
    isActiveUser: jest.fn().mockResolvedValue(true),
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
  const pluginConfig = {
    getConfig: jest.fn().mockResolvedValue({ enabled: over.enabled ?? true }),
  };
  const svc = new SpaceAccessRequestService(
    repo as any, spaceRepo as any, members as any, db, queue as any,
    events as any, audit as any, pluginConfig as any,
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
    const { svc, members, repo, events } = build({ members: adminRoles });
    await svc.approve('r1', 'writer' as any, admin as any);
    expect(members.insertSpaceMember).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 's1', userId: 'u2', role: 'writer', addedById: 'a1' }),
      trx,
    );
    expect(repo.decide).toHaveBeenCalledWith('r1', trx, expect.objectContaining({ status: 'approved', roleGranted: 'writer', reviewerId: 'a1' }));
    expect(events.emit).toHaveBeenCalled();
  });

  it('does not insert a duplicate member when requester became a member meanwhile', async () => {
    const { svc, members, repo, events } = build({
      members: { ...adminRoles, getSpaceMemberByTypeId: jest.fn().mockResolvedValue({ id: 'm', role: 'writer' }) },
    });
    await svc.approve('r1', 'reader' as any, admin as any);
    expect(members.insertSpaceMember).not.toHaveBeenCalled();
    expect(repo.decide).toHaveBeenCalledWith('r1', trx, expect.objectContaining({ roleGranted: 'writer' }));
    expect(events.emit).not.toHaveBeenCalled();
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
        members: adminRoles,
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
    const { svc, repo, queue } = build({ members: adminRoles });
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

describe('SpaceAccessRequestService.info', () => {
  const withSpace = (svc: any, space: any) => {
    svc.spaceRepo.findBySlug = jest.fn().mockResolvedValue(space);
  };

  it('returns space:null for an unknown slug', async () => {
    const { svc } = build();
    withSpace(svc, undefined);
    expect(await svc.info('nope', user() as any)).toEqual({
      space: null,
      request: null,
      canRequest: false,
    });
  });

  it('canRequest is false while a request is pending', async () => {
    const { svc } = build({
      repo: {
        findLatestForSpaceAndUser: jest
          .fn()
          .mockResolvedValue({ id: 'r', status: 'pending' }),
      },
    });
    withSpace(svc, { id: 's1', name: 'S', slug: 's' });
    const res: any = await svc.info('s', user() as any);
    expect(res.canRequest).toBe(false);
    expect(res.space).toEqual({ id: 's1', name: 'S', slug: 's' });
    expect(res.request.status).toBe('pending');
  });

  it('canRequest is true for a non-member with no history', async () => {
    const { svc } = build();
    withSpace(svc, { id: 's1', name: 'S', slug: 's' });
    const res: any = await svc.info('s', user() as any);
    expect(res.canRequest).toBe(true);
  });
});

describe('SpaceAccessRequestService plugin switch (Settings > Plugins)', () => {
  it.each(['create', 'approve', 'reject'])('%s throws Forbidden when disabled', async (m) => {
    const { svc, repo } = build({ enabled: false });
    const call: any = {
      create: () => svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any),
      approve: () => svc.approve('r1', 'reader' as any, user({ role: 'admin' }) as any),
      reject: () => svc.reject('r1', undefined, user({ role: 'admin' }) as any),
    }[m];
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('info/list/count return empty results when disabled', async () => {
    const { svc } = build({ enabled: false });
    expect(await svc.info('s', user() as any)).toEqual({ space: null, request: null, canRequest: false });
    expect((await svc.list(user() as any, { limit: 20 } as any)).items).toEqual([]);
    expect(await svc.count(user() as any)).toBe(0);
  });

  it('a failing config lookup is treated as disabled', async () => {
    const { svc } = build();
    (svc as any).pluginConfig.getConfig = jest.fn().mockRejectedValue(new Error('x'));
    expect(await svc.isEnabled('w1')).toBe(false);
  });
});

describe('SpaceAccessRequestService review fixes', () => {

  it('create refuses personal spaces', async () => {
    const { svc } = build();
    (svc as any).spaceRepo.findById = jest.fn().mockResolvedValue({ id: 's1', isPersonal: true });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('create refuses trashed spaces', async () => {
    const { svc } = build();
    (svc as any).spaceRepo.findById = jest.fn().mockResolvedValue({ id: 's1', deletedAt: new Date() });
    await expect(svc.create({ spaceId: 's1', role: 'reader' as any }, user() as any))
      .rejects.toThrow();
  });

  it('info hides personal spaces', async () => {
    const { svc } = build();
    (svc as any).spaceRepo.findBySlug = jest.fn().mockResolvedValue({ id: 's1', name: 'P', slug: 'p', isPersonal: true });
    expect(await svc.info('p', user() as any)).toEqual({ space: null, request: null, canRequest: false });
  });

  it('a workspace admin without a space admin role cannot approve (personal space)', async () => {
    const { svc, repo } = build(); // getUserSpaceRoles -> undefined, as for personal spaces
    await expect(svc.approve('r1', 'reader' as any, user({ id: 'a1', role: 'admin' }) as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('approve/reject refuse the requester deciding their own request', async () => {
    const { svc, repo } = build({
      members: adminRoles,
      repo: { findByIdForUpdate: jest.fn().mockResolvedValue(pendingRow({ requesterId: 'a1' })) },
    });
    const me = user({ id: 'a1', role: 'admin' }) as any;
    await expect(svc.approve('r1', 'reader' as any, me)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.reject('r1', undefined, me)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('approve throws Conflict when the requester is no longer an active user', async () => {
    const { svc, members, repo } = build({
      members: adminRoles,
      repo: { isActiveUser: jest.fn().mockResolvedValue(false) },
    });
    await expect(svc.approve('r1', 'reader' as any, user({ id: 'a1', role: 'admin' }) as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(members.insertSpaceMember).not.toHaveBeenCalled();
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('a unique-violation on member insert (concurrent add) maps to Conflict', async () => {
    const { svc } = build({
      members: { ...adminRoles, insertSpaceMember: jest.fn().mockRejectedValue({ code: '23505' }) },
    });
    await expect(svc.approve('r1', 'reader' as any, user({ id: 'a1', role: 'admin' }) as any))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
