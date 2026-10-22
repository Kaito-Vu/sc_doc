import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserSession } from '@docmost/db/types/entity.types';
import { WsService } from '../../../ws/ws.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { PluginConfigService } from '../services/plugin-config.service';
import {
  SESSION_GUARD_DEFAULT_GRACE_SECONDS,
  SESSION_GUARD_JOB_EXPIRE,
  SESSION_GUARD_LOCK_RETRIES,
  SESSION_GUARD_LOCK_RETRY_DELAY_MS,
  SESSION_GUARD_MAX_GRACE_SECONDS,
  SESSION_GUARD_MAX_OTHER_SESSIONS,
  SESSION_GUARD_MIN_GRACE_SECONDS,
  SESSION_GUARD_PLUGIN_ID,
  SESSION_GUARD_QUEUE,
} from './session-guard.constants';
import { isTrustedIp, isUserExempt } from './session-guard.exemptions';
import {
  SessionGuardConflict,
  SessionGuardSessionStatus,
  SessionGuardStore,
} from './session-guard.store';

export interface SessionGuardHookContext {
  user: { id: string; role?: string | null; workspaceId?: string };
  workspaceId: string;
  session: UserSession;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type SessionGuardResolution = 'denied' | 'allowed';

const CONFLICT_STATE_EXTRA_TTL_SECONDS = 60;
const DISCONNECT_DELAY_MS = 1000;

@Injectable()
export class SessionGuardService {
  private readonly logger = new Logger(SessionGuardService.name);

  constructor(
    private readonly pluginConfigService: PluginConfigService,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly wsService: WsService,
    private readonly store: SessionGuardStore,
    @InjectQueue(SESSION_GUARD_QUEUE) private readonly queue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async onSessionCreated(context: SessionGuardHookContext): Promise<void> {
    try {
      await this.handleSessionCreated(context);
    } catch (err) {
      this.logger.warn(
        `Session guard failed after session creation: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async expireConflict(conflictId: string): Promise<void> {
    const conflict = await this.store.consumeConflict(conflictId);
    if (!conflict) return;

    try {
      await this.store.deleteUserConflict(
        conflict.workspaceId,
        conflict.userId,
        conflict.conflictId,
      );

      const newSession = await this.userSessionRepo.findActiveById(
        conflict.newSessionId,
      );

      // The admin may have added an exemption while the conflict was pending.
      const exempt = newSession
        ? await this.isExempt(
            conflict.workspaceId,
            conflict.userId,
            conflict.newIp,
          )
        : false;

      if (!newSession || exempt) {
        for (const sessionId of conflict.oldSessionIds) {
          await this.store.setSessionStatus(
            sessionId,
            this.oldSessionStatus(conflict, 'resolved', 'new_session_gone'),
          );
          this.wsService.emitToSession(
            sessionId,
            'security:session-conflict-resolved',
            {
              conflictId: conflict.conflictId,
              outcome: 'cancelled',
              reason: 'new_session_gone',
            },
          );
        }

        this.auditResolved(conflict, 'cancelled', 'system', {
          reason: exempt ? 'exempted' : 'new_session_gone',
        });
        return;
      }

      // An existing session whose client is still online and simply did not
      // answer must not be signed out by a stranger's login: reject the new one.
      if (await this.anyAlive(conflict.oldSessionIds)) {
        await this.denyConflict(conflict, 'existing_online', 'system');
        return;
      }

      for (const sessionId of conflict.oldSessionIds) {
        await this.userSessionRepo.revokeById(
          sessionId,
          conflict.userId,
          conflict.workspaceId,
        );
        await this.store.setSessionStatus(
          sessionId,
          this.oldSessionStatus(conflict, 'revoked', 'new_login_timeout'),
        );
        this.wsService.emitToSession(sessionId, 'security:session-revoked', {
          conflictId: conflict.conflictId,
          reason: 'new_login_timeout',
        });
      }

      await this.store.setSessionStatus(
        conflict.newSessionId,
        this.newSessionStatus(conflict, 'kept', 'new_login_timeout'),
      );
      this.wsService.emitToSession(
        conflict.newSessionId,
        'security:session-conflict-resolved',
        {
          conflictId: conflict.conflictId,
          outcome: 'kept',
          reason: 'new_login_timeout',
        },
      );

      this.disconnectLater(conflict.oldSessionIds);

      this.auditResolved(conflict, 'timeout_old_revoked', 'system', {
        reason: 'new_login_timeout',
      });
    } catch (err) {
      // Re-arm the conflict so BullMQ's retry can finish the revocation.
      await this.restoreConflict(conflict);
      throw err;
    }
  }

  async resolveConflict(
    conflictId: string,
    action: 'deny' | 'allow',
    sessionId: string,
    workspaceId: string,
  ): Promise<SessionGuardResolution> {
    // Validate before consuming: a caller that does not own this conflict must
    // not be able to delete the pending state and cancel the timeout.
    const pending = await this.store.getConflict(conflictId);
    if (!pending) {
      throw new BadRequestException('Conflict not found or already resolved');
    }

    if (
      pending.workspaceId !== workspaceId ||
      pending.primarySessionId !== sessionId
    ) {
      throw new ForbiddenException('You cannot resolve this conflict');
    }

    // GETDEL makes the timeout job and allow/deny mutually exclusive. If the
    // job won the race the state is gone and there is nothing left to resolve.
    const conflict = await this.store.consumeConflict(conflictId);
    if (!conflict) {
      throw new BadRequestException('Conflict not found or already resolved');
    }

    if (
      conflict.workspaceId !== workspaceId ||
      conflict.primarySessionId !== sessionId
    ) {
      throw new ForbiddenException('You cannot resolve this conflict');
    }

    try {
      await this.removeJob(conflictId);

      if (action === 'deny') {
        await this.denyConflict(conflict);
        return 'denied';
      }

      await this.allowConflict(conflict);
      return 'allowed';
    } catch (err) {
      // The state was consumed above. Restore it (and the expiry job) so a
      // transient DB/Redis failure does not leave both sessions active.
      await this.restoreConflict(conflict);
      throw err;
    }
  }

  private async restoreConflict(conflict: SessionGuardConflict): Promise<void> {
    const ttl = conflict.graceSeconds + CONFLICT_STATE_EXTRA_TTL_SECONDS;

    try {
      await this.store.setConflict(conflict, ttl);
      await this.store.setUserConflict(
        conflict.workspaceId,
        conflict.userId,
        conflict.conflictId,
        ttl,
      );

      const existing = await this.queue.getJob(conflict.conflictId);
      if (!existing) {
        await this.queue.add(
          SESSION_GUARD_JOB_EXPIRE,
          { conflictId: conflict.conflictId },
          {
            jobId: conflict.conflictId,
            delay: Math.max(0, conflict.deadline - Date.now()),
          },
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to restore session guard conflict ${conflict.conflictId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async getStatus(sessionId: string): Promise<Record<string, unknown>> {
    try {
      await this.store.touchAlive(sessionId);
      const status = await this.store.getSessionStatus(sessionId);
      return status ? { ...status } : { status: 'none' };
    } catch (err) {
      this.logger.warn(
        `Failed to read session guard status: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return { status: 'none' };
    }
  }

  private async handleSessionCreated(
    context: SessionGuardHookContext,
  ): Promise<void> {
    const session = context?.session;
    const userId = context?.user?.id;
    const workspaceId = context?.workspaceId ?? context?.user?.workspaceId;

    if (!session?.id || !userId || !workspaceId) return;

    const config = await this.pluginConfigService.getConfig(
      workspaceId,
      SESSION_GUARD_PLUGIN_ID,
    );
    if (!config?.enabled) return;

    const newIp = normalizeIp(context.ipAddress ?? session.ipAddress);
    const exemptions = config.config;
    if (
      isUserExempt(exemptions, { id: userId, role: context.user.role }, newIp)
    ) {
      return;
    }
    if (await this.isInExemptGroup(userId, exemptions)) return;

    const others = (
      await this.userSessionRepo.findActiveByUser(userId, workspaceId)
    )
      .filter((candidate) => candidate.id !== session.id)
      .slice(0, SESSION_GUARD_MAX_OTHER_SESSIONS);

    if (others.length === 0) return;

    const isConflict = (candidate: UserSession) => {
      const oldIp = normalizeIp(candidate.ipAddress);
      if (oldIp && isTrustedIp(oldIp, exemptions?.trustedIps)) return false;
      return !newIp || !oldIp || oldIp !== newIp;
    };
    const conflicting = others.filter(isConflict);

    if (conflicting.length === 0) return;

    const lockToken = randomUUID();
    const locked = await this.acquireLock(workspaceId, userId, lockToken);
    if (!locked) {
      this.logger.warn(
        `Session guard lock busy for user ${userId} in workspace ${workspaceId}`,
      );
      return;
    }

    try {
      // Another login may have created/revoked sessions while we waited for
      // the lock. Resolve the previous conflict first so its superseded new
      // session is not treated as an active "old" session below.
      const shouldCreateConflict = await this.supersedePreviousConflict(
        workspaceId,
        userId,
        session.id,
      );
      if (!shouldCreateConflict) return;

      const freshConflicting = (
        await this.userSessionRepo.findActiveByUser(userId, workspaceId)
      )
        .filter((candidate) => candidate.id !== session.id)
        .slice(0, SESSION_GUARD_MAX_OTHER_SESSIONS)
        .filter(isConflict);

      if (freshConflicting.length === 0) return;

      await this.createConflict({
        workspaceId,
        userId,
        session,
        newIp,
        conflicting: freshConflicting,
        graceSeconds: getGraceSeconds(config.config),
      });
    } finally {
      await this.store
        .releaseLock(workspaceId, userId, lockToken)
        .catch(() => undefined);
    }
  }

  private async isInExemptGroup(
    userId: string,
    config: Record<string, unknown> | undefined,
  ): Promise<boolean> {
    const exemptGroups = config?.exemptGroupIds;
    if (!Array.isArray(exemptGroups) || exemptGroups.length === 0) return false;

    const groupIds = await this.groupUserRepo.getUserGroupIds(userId);
    return groupIds.some((id) => exemptGroups.includes(id));
  }

  private async isExempt(
    workspaceId: string,
    userId: string,
    newIp: string | null,
  ): Promise<boolean> {
    try {
      const config = await this.pluginConfigService.getConfig(
        workspaceId,
        SESSION_GUARD_PLUGIN_ID,
      );
      if (isUserExempt(config?.config, { id: userId }, newIp)) return true;
      return await this.isInExemptGroup(userId, config?.config);
    } catch {
      return false;
    }
  }

  private async supersedePreviousConflict(
    workspaceId: string,
    userId: string,
    currentSessionId: string,
  ): Promise<boolean> {
    const existingConflictId = await this.store.getUserConflict(
      workspaceId,
      userId,
    );
    if (!existingConflictId) return true;

    const previous = await this.store.getConflict(existingConflictId);
    if (!previous) {
      await this.store
        .deleteUserConflict(workspaceId, userId, existingConflictId)
        .catch(() => undefined);
      return true;
    }

    // The same session can reach this hook twice (e.g. a duplicate module
    // registration). Do not create a second conflict for it.
    if (previous.newSessionId === currentSessionId) return false;

    // allow/deny/timeout won the race and already resolved it.
    if (!(await this.store.consumeConflict(existingConflictId))) return true;
    await this.store
      .deleteUserConflict(workspaceId, userId, existingConflictId)
      .catch(() => undefined);
    await this.removeJob(existingConflictId);

    await this.userSessionRepo.revokeById(
      previous.newSessionId,
      userId,
      workspaceId,
    );
    await this.store.setSessionStatus(
      previous.newSessionId,
      this.newSessionStatus(previous, 'revoked', 'superseded'),
    );
    this.wsService.emitToSession(
      previous.newSessionId,
      'security:session-revoked',
      {
        conflictId: previous.conflictId,
        reason: 'superseded',
      },
    );
    this.disconnectLater([previous.newSessionId]);
    this.auditResolved(previous, 'superseded', 'system', {
      reason: 'superseded',
    });

    for (const oldSessionId of previous.oldSessionIds) {
      await this.store.setSessionStatus(
        oldSessionId,
        this.oldSessionStatus(previous, 'kept', 'superseded'),
      );
      this.wsService.emitToSession(
        oldSessionId,
        'security:session-conflict-resolved',
        {
          conflictId: previous.conflictId,
          outcome: 'superseded',
          reason: 'superseded',
        },
      );
    }

    return true;
  }

  private async createConflict(input: {
    workspaceId: string;
    userId: string;
    session: UserSession;
    newIp: string | null;
    conflicting: UserSession[];
    graceSeconds: number;
  }): Promise<void> {
    const { workspaceId, userId, session, newIp, conflicting, graceSeconds } =
      input;

    const primary = pickPrimarySession(conflicting);
    if (!primary) return;

    const conflictId = randomUUID();
    const deadline = Date.now() + graceSeconds * 1000;
    const stateTtl = graceSeconds + CONFLICT_STATE_EXTRA_TTL_SECONDS;
    const conflict: SessionGuardConflict = {
      conflictId,
      workspaceId,
      userId,
      newSessionId: session.id,
      oldSessionIds: conflicting.map((candidate) => candidate.id),
      primarySessionId: primary.id,
      newIp,
      newDeviceName: session.deviceName ?? null,
      oldIps: conflicting.map((candidate) => normalizeIp(candidate.ipAddress)),
      primaryIp: normalizeIp(primary.ipAddress),
      primaryDeviceName: primary.deviceName ?? null,
      deadline,
      graceSeconds,
      createdAt: Date.now(),
    };

    await this.store.setConflict(conflict, stateTtl);
    await this.store.setUserConflict(workspaceId, userId, conflictId, stateTtl);
    try {
      await this.queue.add(
        SESSION_GUARD_JOB_EXPIRE,
        { conflictId },
        {
          jobId: conflictId,
          delay: graceSeconds * 1000,
        },
      );
    } catch (err) {
      await this.store.consumeConflict(conflictId).catch(() => undefined);
      await this.store
        .deleteUserConflict(workspaceId, userId, conflictId)
        .catch(() => undefined);
      throw err;
    }

    for (const candidate of conflicting) {
      const canRespond = candidate.id === primary.id;
      const status = this.oldSessionStatus(conflict, 'pending');

      await this.store.setSessionStatus(candidate.id, {
        ...status,
        canRespond,
      });
      this.wsService.emitToSession(candidate.id, 'security:session-conflict', {
        conflictId,
        role: 'existing',
        deadline,
        peerIp: conflict.newIp,
        peerDevice: conflict.newDeviceName,
        canRespond,
      });
    }

    await this.store.setSessionStatus(
      session.id,
      this.newSessionStatus(conflict, 'pending'),
    );
    this.wsService.emitToSession(session.id, 'security:session-conflict', {
      conflictId,
      role: 'new',
      deadline,
      peerIp: conflict.primaryIp,
      peerDevice: conflict.primaryDeviceName,
      canRespond: false,
    });

    this.writeAudit(
      conflict,
      AuditEvent.SESSION_CONFLICT,
      {
        reason: 'single_session_conflict',
        ...this.conflictAuditMetadata(conflict),
      },
      'user',
    );
  }

  private async anyAlive(sessionIds: string[]): Promise<boolean> {
    // Errors propagate: the caller re-arms the conflict for a BullMQ retry
    // instead of revoking old sessions on an unknown liveness state.
    const alive = await Promise.all(
      sessionIds.map((id) => this.store.isAlive(id)),
    );
    return alive.some(Boolean);
  }

  private async denyConflict(
    conflict: SessionGuardConflict,
    reason = 'denied_by_existing',
    actorType: 'user' | 'system' = 'user',
  ): Promise<void> {
    await this.userSessionRepo.revokeById(
      conflict.newSessionId,
      conflict.userId,
      conflict.workspaceId,
    );
    await this.store.setSessionStatus(
      conflict.newSessionId,
      this.newSessionStatus(conflict, 'revoked', reason),
    );
    this.wsService.emitToSession(
      conflict.newSessionId,
      'security:session-revoked',
      {
        conflictId: conflict.conflictId,
        reason,
      },
    );

    for (const sessionId of conflict.oldSessionIds) {
      await this.store.setSessionStatus(
        sessionId,
        this.oldSessionStatus(conflict, 'kept', reason),
      );
      this.wsService.emitToSession(
        sessionId,
        'security:session-conflict-resolved',
        {
          conflictId: conflict.conflictId,
          outcome: 'denied',
          reason,
        },
      );
    }

    this.disconnectLater([conflict.newSessionId]);

    this.auditResolved(
      conflict,
      reason === 'existing_online' ? 'timeout_new_revoked' : 'denied',
      actorType,
      { reason },
    );
  }

  private async allowConflict(conflict: SessionGuardConflict): Promise<void> {
    for (const sessionId of conflict.oldSessionIds) {
      await this.userSessionRepo.revokeById(
        sessionId,
        conflict.userId,
        conflict.workspaceId,
      );
      await this.store.setSessionStatus(
        sessionId,
        this.oldSessionStatus(conflict, 'revoked', 'allowed_by_existing'),
      );
      this.wsService.emitToSession(sessionId, 'security:session-revoked', {
        conflictId: conflict.conflictId,
        reason: 'allowed_by_existing',
      });
    }

    await this.store.setSessionStatus(
      conflict.newSessionId,
      this.newSessionStatus(conflict, 'kept', 'allowed_by_existing'),
    );
    this.wsService.emitToSession(
      conflict.newSessionId,
      'security:session-conflict-resolved',
      {
        conflictId: conflict.conflictId,
        outcome: 'allowed',
        reason: 'allowed_by_existing',
      },
    );

    this.disconnectLater(conflict.oldSessionIds);

    this.auditResolved(conflict, 'allowed', 'user', {
      reason: 'allowed_by_existing',
    });
  }

  private oldSessionStatus(
    conflict: SessionGuardConflict,
    status: SessionGuardSessionStatus['status'],
    reason?: string,
  ): SessionGuardSessionStatus {
    return {
      conflictId: conflict.conflictId,
      role: 'existing',
      status,
      deadline: conflict.deadline,
      canRespond: false,
      reason,
      peerIp: conflict.newIp,
      peerDevice: conflict.newDeviceName,
    };
  }

  private newSessionStatus(
    conflict: SessionGuardConflict,
    status: SessionGuardSessionStatus['status'],
    reason?: string,
  ): SessionGuardSessionStatus {
    return {
      conflictId: conflict.conflictId,
      role: 'new',
      status,
      deadline: conflict.deadline,
      canRespond: false,
      reason,
      peerIp: conflict.primaryIp,
      peerDevice: conflict.primaryDeviceName,
    };
  }

  private async acquireLock(
    workspaceId: string,
    userId: string,
    token: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < SESSION_GUARD_LOCK_RETRIES; attempt++) {
      if (await this.store.acquireLock(workspaceId, userId, token)) {
        return true;
      }

      if (attempt < SESSION_GUARD_LOCK_RETRIES - 1) {
        await delay(SESSION_GUARD_LOCK_RETRY_DELAY_MS);
      }
    }

    return false;
  }

  private async removeJob(conflictId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(conflictId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      this.logger.warn(
        `Failed to remove session guard job ${conflictId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private disconnectLater(sessionIds: string[]): void {
    const timer = setTimeout(() => {
      for (const sessionId of sessionIds) {
        try {
          this.wsService.disconnectSession(sessionId);
        } catch (err) {
          this.logger.warn(
            `Failed to disconnect session ${sessionId}: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    }, DISCONNECT_DELAY_MS);

    timer.unref?.();
  }

  private conflictAuditMetadata(conflict: SessionGuardConflict) {
    return {
      conflictId: conflict.conflictId,
      newSessionId: conflict.newSessionId,
      newIp: conflict.newIp,
      newDevice: conflict.newDeviceName,
      oldSessionIds: conflict.oldSessionIds,
      oldIps: conflict.oldIps ?? [conflict.primaryIp],
      primarySessionId: conflict.primarySessionId,
      primaryIp: conflict.primaryIp,
      primaryDevice: conflict.primaryDeviceName,
      graceSeconds: conflict.graceSeconds,
    };
  }

  /**
   * Records how a conflict ended. `outcome` is the decision: allowed / denied
   * (by the existing session's user), timeout_old_revoked / timeout_new_revoked
   * (no answer in time), superseded or cancelled. `decidedBy` is the user for
   * an explicit choice and the system for automatic ones.
   */
  private auditResolved(
    conflict: SessionGuardConflict,
    outcome: string,
    decidedBy: 'user' | 'system',
    extra: Record<string, unknown> = {},
  ): void {
    this.writeAudit(
      conflict,
      AuditEvent.SESSION_CONFLICT_RESOLVED,
      {
        ...this.conflictAuditMetadata(conflict),
        outcome,
        decidedBy,
        ...extra,
      },
      decidedBy,
    );
  }

  private writeAudit(
    conflict: SessionGuardConflict,
    event:
      | typeof AuditEvent.SESSION_CONFLICT
      | typeof AuditEvent.SESSION_CONFLICT_RESOLVED
      | typeof AuditEvent.SESSION_REVOKED
      | typeof AuditEvent.SESSIONS_REVOKED,
    metadata: Record<string, unknown>,
    actorType: 'user' | 'system',
  ): void {
    const payload = {
      event,
      resourceType: AuditResource.SESSION,
      resourceId: conflict.newSessionId,
      metadata,
    };

    try {
      if (typeof this.auditService.logWithContext === 'function') {
        this.auditService.logWithContext(payload, {
          workspaceId: conflict.workspaceId,
          actorId: conflict.userId,
          actorType,
        });
      } else {
        this.auditService.log(payload);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to write session guard audit log: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  let ip = value.trim().toLowerCase();
  if (!ip) return null;

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }

  // Defensive: some drivers return inet values as CIDR (e.g. /32, /128).
  const maskIndex = ip.indexOf('/');
  if (maskIndex !== -1) {
    ip = ip.slice(0, maskIndex);
  }

  if (ip.startsWith('::ffff:') && ip.includes('.')) {
    ip = ip.slice('::ffff:'.length);
  }

  if (!ip || !isIP(ip)) return null;

  // Canonicalise IPv6 (compression, case, leading zeros, mapped hex form).
  if (isIP(ip) === 6) {
    try {
      ip = new URL(`http://[${ip}]`).hostname.slice(1, -1);
    } catch {
      return null;
    }

    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    }
  }

  return ip;
}

function getGraceSeconds(config: Record<string, unknown> | undefined): number {
  const configured = config?.graceSeconds;
  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return SESSION_GUARD_DEFAULT_GRACE_SECONDS;
  }

  return Math.min(
    SESSION_GUARD_MAX_GRACE_SECONDS,
    Math.max(SESSION_GUARD_MIN_GRACE_SECONDS, Math.round(configured)),
  );
}

function pickPrimarySession(sessions: UserSession[]): UserSession | undefined {
  return [...sessions].sort((a, b) => {
    const aTime = sessionTime(a);
    const bTime = sessionTime(b);
    return bTime - aTime;
  })[0];
}

function sessionTime(session: UserSession): number {
  const lastActive = session.lastActiveAt
    ? new Date(session.lastActiveAt).getTime()
    : 0;
  if (Number.isFinite(lastActive) && lastActive > 0) {
    return lastActive;
  }

  const created = session.createdAt ? new Date(session.createdAt).getTime() : 0;
  return Number.isFinite(created) ? created : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
