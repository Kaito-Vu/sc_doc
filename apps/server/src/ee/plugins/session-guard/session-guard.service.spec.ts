import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SessionGuardService, normalizeIp } from './session-guard.service';
import { SessionGuardConflict } from './session-guard.store';

const WORKSPACE_ID = 'ws-1';
const USER_ID = 'user-1';

function makeSession(id: string, ipAddress: string | null, overrides = {}) {
  return {
    id,
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    ipAddress,
    deviceName: 'Chrome on Windows',
    lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeConflict(
  overrides: Partial<SessionGuardConflict> = {},
): SessionGuardConflict {
  return {
    conflictId: 'conflict-1',
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    newSessionId: 'new-1',
    oldSessionIds: ['old-1'],
    primarySessionId: 'old-1',
    newIp: '203.0.113.20',
    newDeviceName: 'Chrome on Windows',
    primaryIp: '203.0.113.10',
    primaryDeviceName: 'Firefox on Linux',
    deadline: Date.now() + 10_000,
    graceSeconds: 10,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeService() {
  const pluginConfigService = {
    getConfig: jest.fn(),
  };
  const userSessionRepo = {
    findActiveByUser: jest.fn(),
    findActiveById: jest.fn(),
    revokeById: jest.fn().mockResolvedValue(true),
  };
  const groupUserRepo = { getUserGroupIds: jest.fn().mockResolvedValue([]) };
  const wsService = {
    emitToSession: jest.fn(),
    disconnectSession: jest.fn(),
  };
  const store = {
    getConflict: jest.fn().mockResolvedValue(null),
    setConflict: jest.fn().mockResolvedValue(undefined),
    consumeConflict: jest.fn().mockResolvedValue(null),
    getUserConflict: jest.fn().mockResolvedValue(null),
    setUserConflict: jest.fn().mockResolvedValue(undefined),
    deleteUserConflict: jest.fn().mockResolvedValue(undefined),
    getSessionStatus: jest.fn().mockResolvedValue(null),
    setSessionStatus: jest.fn().mockResolvedValue(undefined),
    touchAlive: jest.fn().mockResolvedValue(undefined),
    isAlive: jest.fn().mockResolvedValue(false),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'conflict-1' }),
    getJob: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  };
  const auditService = {
    log: jest.fn(),
    logWithContext: jest.fn(),
  };

  const service = new SessionGuardService(
    pluginConfigService as any,
    userSessionRepo as any,
    groupUserRepo as any,
    wsService as any,
    store as any,
    queue as any,
    auditService as any,
  );

  return {
    service,
    pluginConfigService,
    userSessionRepo,
    groupUserRepo,
    wsService,
    store,
    queue,
    auditService,
  };
}

function makeContext(session: any) {
  return {
    user: { id: USER_ID, workspaceId: WORKSPACE_ID },
    workspaceId: WORKSPACE_ID,
    session,
    ipAddress: session.ipAddress,
    userAgent: 'test-agent',
  };
}

describe('SessionGuardService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing when the plugin is disabled', async () => {
    const { service, pluginConfigService, userSessionRepo } = makeService();
    pluginConfigService.getConfig.mockResolvedValue({ enabled: false });

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '1.1.1.1')),
    );

    expect(userSessionRepo.findActiveByUser).not.toHaveBeenCalled();
  });

  it('does nothing when there are no other active sessions', async () => {
    const { service, pluginConfigService, userSessionRepo, store } =
      makeService();
    pluginConfigService.getConfig.mockResolvedValue({ enabled: true });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '1.1.1.1'),
    ]);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '1.1.1.1')),
    );

    expect(store.acquireLock).not.toHaveBeenCalled();
    expect(store.setConflict).not.toHaveBeenCalled();
  });

  it('does not create a conflict when every old session has the same IP', async () => {
    const { service, pluginConfigService, userSessionRepo, store } =
      makeService();
    pluginConfigService.getConfig.mockResolvedValue({ enabled: true });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '::ffff:203.0.113.10'),
      makeSession('old-1', '203.0.113.10'),
    ]);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '::ffff:203.0.113.10')),
    );

    expect(store.acquireLock).not.toHaveBeenCalled();
    expect(store.setConflict).not.toHaveBeenCalled();
  });

  it('stores a conflict, schedules expiry, and notifies both sessions on a different IP', async () => {
    const {
      service,
      pluginConfigService,
      userSessionRepo,
      store,
      queue,
      wsService,
    } = makeService();
    pluginConfigService.getConfig.mockResolvedValue({
      enabled: true,
      config: { graceSeconds: 10 },
    });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '203.0.113.20'),
      makeSession('old-1', '203.0.113.10'),
      makeSession('old-2', '203.0.113.10', {
        lastActiveAt: new Date('2025-12-31T00:00:00.000Z'),
      }),
      makeSession('same-ip', '203.0.113.20'),
    ]);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '203.0.113.20')),
    );

    const [storedConflict, ttl] = store.setConflict.mock.calls[0];
    expect(storedConflict.oldSessionIds).toEqual(['old-1', 'old-2']);
    expect(storedConflict.primarySessionId).toBe('old-1');
    expect(storedConflict.newSessionId).toBe('new-1');
    expect(ttl).toBe(70);
    expect(store.setUserConflict).toHaveBeenCalledWith(
      WORKSPACE_ID,
      USER_ID,
      storedConflict.conflictId,
      70,
    );

    expect(queue.add).toHaveBeenCalledWith(
      'expire',
      { conflictId: storedConflict.conflictId },
      { jobId: storedConflict.conflictId, delay: 10_000 },
    );

    expect(storedConflict.oldSessionIds).not.toContain('same-ip');
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-1',
      'security:session-conflict',
      expect.objectContaining({
        conflictId: storedConflict.conflictId,
        role: 'existing',
        canRespond: true,
      }),
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-2',
      'security:session-conflict',
      expect.objectContaining({ canRespond: false }),
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'new-1',
      'security:session-conflict',
      expect.objectContaining({ role: 'new', canRespond: false }),
    );
    expect(store.releaseLock).toHaveBeenCalled();
  });

  it('supersedes a previous pending conflict before creating the new one', async () => {
    const { service, pluginConfigService, userSessionRepo, store, wsService } =
      makeService();
    pluginConfigService.getConfig.mockResolvedValue({
      enabled: true,
      config: { graceSeconds: 10 },
    });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '203.0.113.30'),
      makeSession('old-1', '203.0.113.10'),
    ]);
    const previous = makeConflict({
      conflictId: 'prev-conflict',
      newSessionId: 'prev-new',
      oldSessionIds: ['old-1'],
      primarySessionId: 'old-1',
    });
    store.getUserConflict.mockResolvedValue('prev-conflict');
    store.getConflict.mockResolvedValue(previous);
    store.consumeConflict.mockResolvedValueOnce(previous);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '203.0.113.30')),
    );

    expect(store.consumeConflict).toHaveBeenCalledWith('prev-conflict');
    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'prev-new',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'prev-new',
      'security:session-revoked',
      { conflictId: 'prev-conflict', reason: 'superseded' },
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-1',
      'security:session-conflict-resolved',
      {
        conflictId: 'prev-conflict',
        outcome: 'superseded',
        reason: 'superseded',
      },
    );
    expect(store.setConflict).toHaveBeenCalledWith(
      expect.objectContaining({ newSessionId: 'new-1' }),
      70,
    );
  });

  it('does not create a duplicate conflict for the same new session', async () => {
    const { service, pluginConfigService, userSessionRepo, store } =
      makeService();
    pluginConfigService.getConfig.mockResolvedValue({ enabled: true });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '203.0.113.30'),
      makeSession('old-1', '203.0.113.10'),
    ]);
    const previous = makeConflict({
      conflictId: 'prev-conflict',
      newSessionId: 'new-1',
      oldSessionIds: ['old-1'],
      primarySessionId: 'old-1',
    });
    store.getUserConflict.mockResolvedValue('prev-conflict');
    store.getConflict.mockResolvedValue(previous);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '203.0.113.30')),
    );

    expect(store.setConflict).not.toHaveBeenCalled();
  });

  it('revokes old sessions when the grace timer expires', async () => {
    jest.useFakeTimers();
    const { service, userSessionRepo, store, wsService } = makeService();
    const conflict = makeConflict();
    store.consumeConflict.mockResolvedValue(conflict);
    userSessionRepo.findActiveById.mockResolvedValue(
      makeSession('new-1', '2.2.2.2'),
    );

    await service.expireConflict('conflict-1');

    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'old-1',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(store.setSessionStatus).toHaveBeenCalledWith(
      'old-1',
      expect.objectContaining({
        status: 'revoked',
        reason: 'new_login_timeout',
      }),
    );
    expect(store.setSessionStatus).toHaveBeenCalledWith(
      'new-1',
      expect.objectContaining({ status: 'kept' }),
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-1',
      'security:session-revoked',
      { conflictId: 'conflict-1', reason: 'new_login_timeout' },
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'new-1',
      'security:session-conflict-resolved',
      {
        conflictId: 'conflict-1',
        outcome: 'kept',
        reason: 'new_login_timeout',
      },
    );
    expect(store.deleteUserConflict).toHaveBeenCalledWith(
      WORKSPACE_ID,
      USER_ID,
      'conflict-1',
    );

    jest.advanceTimersByTime(1000);
    expect(wsService.disconnectSession).toHaveBeenCalledWith('old-1');
  });

  it('rejects the new login on timeout when the existing session is still online', async () => {
    const { service, userSessionRepo, store, wsService } = makeService();
    store.consumeConflict.mockResolvedValue(makeConflict());
    store.isAlive.mockResolvedValue(true);
    userSessionRepo.findActiveById.mockResolvedValue(
      makeSession('new-1', '2.2.2.2'),
    );

    await service.expireConflict('conflict-1');

    expect(userSessionRepo.revokeById).toHaveBeenCalledTimes(1);
    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'new-1',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'new-1',
      'security:session-revoked',
      { conflictId: 'conflict-1', reason: 'existing_online' },
    );
  });

  it('cancels the conflict when the new session is gone before expiry', async () => {
    const { service, userSessionRepo, store, wsService } = makeService();
    store.consumeConflict.mockResolvedValue(makeConflict());
    userSessionRepo.findActiveById.mockResolvedValue(undefined);

    await service.expireConflict('conflict-1');

    expect(userSessionRepo.revokeById).not.toHaveBeenCalled();
    expect(store.setSessionStatus).toHaveBeenCalledWith(
      'old-1',
      expect.objectContaining({
        status: 'resolved',
        reason: 'new_session_gone',
      }),
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-1',
      'security:session-conflict-resolved',
      {
        conflictId: 'conflict-1',
        outcome: 'cancelled',
        reason: 'new_session_gone',
      },
    );
    expect(wsService.disconnectSession).not.toHaveBeenCalled();
  });

  it('deny revokes the new session', async () => {
    jest.useFakeTimers();
    const { service, userSessionRepo, store, wsService, queue } = makeService();
    const conflict = makeConflict();
    store.getConflict.mockResolvedValue(conflict);
    store.consumeConflict.mockResolvedValue(conflict);

    const outcome = await service.resolveConflict(
      'conflict-1',
      'deny',
      'old-1',
      WORKSPACE_ID,
    );

    expect(outcome).toBe('denied');
    expect(queue.getJob).toHaveBeenCalledWith('conflict-1');
    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'new-1',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(store.setSessionStatus).toHaveBeenCalledWith(
      'new-1',
      expect.objectContaining({
        status: 'revoked',
        reason: 'denied_by_existing',
      }),
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'new-1',
      'security:session-revoked',
      { conflictId: 'conflict-1', reason: 'denied_by_existing' },
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'old-1',
      'security:session-conflict-resolved',
      {
        conflictId: 'conflict-1',
        outcome: 'denied',
        reason: 'denied_by_existing',
      },
    );

    jest.advanceTimersByTime(1000);
    expect(wsService.disconnectSession).toHaveBeenCalledWith('new-1');
  });

  it('allow revokes the old sessions', async () => {
    jest.useFakeTimers();
    const { service, userSessionRepo, store, wsService } = makeService();
    const conflict = makeConflict({ oldSessionIds: ['old-1', 'old-2'] });
    store.getConflict.mockResolvedValue(conflict);
    store.consumeConflict.mockResolvedValue(conflict);

    const outcome = await service.resolveConflict(
      'conflict-1',
      'allow',
      'old-1',
      WORKSPACE_ID,
    );

    expect(outcome).toBe('allowed');
    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'old-1',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(userSessionRepo.revokeById).toHaveBeenCalledWith(
      'old-2',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(userSessionRepo.revokeById).not.toHaveBeenCalledWith(
      'new-1',
      USER_ID,
      WORKSPACE_ID,
    );
    expect(wsService.emitToSession).toHaveBeenCalledWith(
      'new-1',
      'security:session-conflict-resolved',
      {
        conflictId: 'conflict-1',
        outcome: 'allowed',
        reason: 'allowed_by_existing',
      },
    );
    expect(store.setSessionStatus).toHaveBeenCalledWith(
      'new-1',
      expect.objectContaining({ status: 'kept' }),
    );

    jest.advanceTimersByTime(1000);
    expect(wsService.disconnectSession).toHaveBeenCalledWith('old-1');
    expect(wsService.disconnectSession).toHaveBeenCalledWith('old-2');
  });

  it('rejects a resolution from a session outside the conflict', async () => {
    const { service, userSessionRepo, store } = makeService();
    const conflict = makeConflict();
    store.getConflict.mockResolvedValue(conflict);

    await expect(
      service.resolveConflict(
        'conflict-1',
        'deny',
        'other-session',
        WORKSPACE_ID,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(store.consumeConflict).not.toHaveBeenCalled();
    expect(userSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('rejects a non-primary old session without consuming the conflict', async () => {
    const { service, store } = makeService();
    const conflict = makeConflict({ oldSessionIds: ['old-1', 'old-2'] });
    store.getConflict.mockResolvedValue(conflict);

    await expect(
      service.resolveConflict('conflict-1', 'deny', 'old-2', WORKSPACE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(store.consumeConflict).not.toHaveBeenCalled();
  });

  it('throws BadRequest when the conflict has already been consumed', async () => {
    const { service } = makeService();

    await expect(
      service.resolveConflict('conflict-1', 'allow', 'old-1', WORKSPACE_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not supersede when allow/deny already consumed the conflict', async () => {
    const { service, pluginConfigService, userSessionRepo, store } =
      makeService();
    pluginConfigService.getConfig.mockResolvedValue({
      enabled: true,
      config: {},
    });
    userSessionRepo.findActiveByUser.mockResolvedValue([
      makeSession('new-1', '203.0.113.30'),
      makeSession('old-1', '203.0.113.10'),
    ]);
    store.getUserConflict.mockResolvedValue('prev-conflict');
    store.getConflict.mockResolvedValue(
      makeConflict({ conflictId: 'prev-conflict', newSessionId: 'prev-new' }),
    );
    store.consumeConflict.mockResolvedValue(null);

    await service.onSessionCreated(
      makeContext(makeSession('new-1', '203.0.113.30')),
    );

    expect(userSessionRepo.revokeById).not.toHaveBeenCalledWith(
      'prev-new',
      USER_ID,
      WORKSPACE_ID,
    );
  });

  describe('exemptions', () => {
    const run = async (
      config: Record<string, unknown>,
      groups: string[] = [],
    ) => {
      const m = makeService();
      m.pluginConfigService.getConfig.mockResolvedValue({
        enabled: true,
        config,
      });
      m.groupUserRepo.getUserGroupIds.mockResolvedValue(groups);
      m.userSessionRepo.findActiveByUser.mockResolvedValue([
        makeSession('old-1', '203.0.113.10'),
        makeSession('new-1', '198.51.100.7'),
      ]);
      await m.service.onSessionCreated({
        ...makeContext(makeSession('new-1', '198.51.100.7')),
        user: { id: USER_ID, role: 'member', workspaceId: WORKSPACE_ID },
      });
      return m;
    };

    it('creates a conflict when no rule matches', async () => {
      const { queue } = await run({ exemptUserIds: ['someone-else'] });
      expect(queue.add).toHaveBeenCalled();
    });

    it.each([
      ['user id', { exemptUserIds: [USER_ID] }, []],
      ['role', { exemptRoles: ['member'] }, []],
      ['trusted CIDR', { trustedIps: ['198.51.100.0/24'] }, []],
      ['group', { exemptGroupIds: ['g1'] }, ['g1']],
    ])('skips the guard for an exempt %s', async (_n, config, groups) => {
      const { queue, userSessionRepo } = await run(config, groups as string[]);
      expect(queue.add).not.toHaveBeenCalled();
      expect(userSessionRepo.revokeById).not.toHaveBeenCalled();
    });

    it('ignores a malformed trusted entry instead of exempting everyone', async () => {
      const { queue } = await run({ trustedIps: ['garbage', '1.2.3.4/99'] });
      expect(queue.add).toHaveBeenCalled();
    });
  });

  describe('normalizeIp', () => {
    it.each([
      ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
      ['::ffff:7f00:1', '127.0.0.1'],
      ['::ffff:203.0.113.10', '203.0.113.10'],
      ['not-an-ip', null],
      ['[2001:db8::1]', '2001:db8::1'],
    ])('%s -> %s', (input, expected) => {
      expect(normalizeIp(input)).toBe(expected);
    });
  });
});
