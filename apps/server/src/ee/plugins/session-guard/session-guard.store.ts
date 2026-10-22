import { Injectable } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import {
  SESSION_GUARD_ALIVE_TTL_SECONDS,
  SESSION_GUARD_LOCK_TTL_SECONDS,
  SESSION_GUARD_STATE_TTL_SECONDS,
  sessionGuardAliveKey,
  sessionGuardConflictKey,
  sessionGuardLockKey,
  sessionGuardSessionKey,
  sessionGuardUserKey,
} from './session-guard.constants';

export type SessionGuardRole = 'existing' | 'new';
export type SessionGuardStatusValue =
  | 'pending'
  | 'revoked'
  | 'kept'
  | 'resolved';

export interface SessionGuardSessionStatus {
  conflictId: string;
  role: SessionGuardRole;
  status: SessionGuardStatusValue;
  deadline?: number;
  canRespond: boolean;
  reason?: string;
  peerIp?: string | null;
  peerDevice?: string | null;
}

export interface SessionGuardConflict {
  conflictId: string;
  workspaceId: string;
  userId: string;
  newSessionId: string;
  oldSessionIds: string[];
  primarySessionId: string;
  newIp: string | null;
  newDeviceName: string | null;
  oldIps?: (string | null)[];
  primaryIp: string | null;
  primaryDeviceName: string | null;
  deadline: number;
  graceSeconds: number;
  createdAt: number;
}

@Injectable()
export class SessionGuardStore {
  private readonly redis: Redis;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async getConflict(conflictId: string): Promise<SessionGuardConflict | null> {
    const raw = await this.redis.get(sessionGuardConflictKey(conflictId));
    return this.parse<SessionGuardConflict>(raw);
  }

  async setConflict(
    conflict: SessionGuardConflict,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      sessionGuardConflictKey(conflict.conflictId),
      JSON.stringify(conflict),
      'EX',
      ttlSeconds,
    );
  }

  async consumeConflict(
    conflictId: string,
  ): Promise<SessionGuardConflict | null> {
    const raw = await this.redis.getdel(sessionGuardConflictKey(conflictId));
    return this.parse<SessionGuardConflict>(raw);
  }

  async getUserConflict(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    return this.redis.get(sessionGuardUserKey(workspaceId, userId));
  }

  async setUserConflict(
    workspaceId: string,
    userId: string,
    conflictId: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      sessionGuardUserKey(workspaceId, userId),
      conflictId,
      'EX',
      ttlSeconds,
    );
  }

  async deleteUserConflict(
    workspaceId: string,
    userId: string,
    conflictId?: string,
  ): Promise<void> {
    const key = sessionGuardUserKey(workspaceId, userId);

    if (!conflictId) {
      await this.redis.del(key);
      return;
    }

    await this.redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      1,
      key,
      conflictId,
    );
  }

  async getSessionStatus(
    sessionId: string,
  ): Promise<SessionGuardSessionStatus | null> {
    const raw = await this.redis.get(sessionGuardSessionKey(sessionId));
    return this.parse<SessionGuardSessionStatus>(raw);
  }

  /** Marks a session's client as alive; it re-polls status while a conflict is pending. */
  async touchAlive(sessionId: string): Promise<void> {
    await this.redis.set(
      sessionGuardAliveKey(sessionId),
      '1',
      'EX',
      SESSION_GUARD_ALIVE_TTL_SECONDS,
    );
  }

  async isAlive(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(sessionGuardAliveKey(sessionId))) === 1;
  }

  async setSessionStatus(
    sessionId: string,
    status: SessionGuardSessionStatus,
    ttlSeconds = SESSION_GUARD_STATE_TTL_SECONDS,
  ): Promise<void> {
    await this.redis.set(
      sessionGuardSessionKey(sessionId),
      JSON.stringify(status),
      'EX',
      ttlSeconds,
    );
  }

  async acquireLock(
    workspaceId: string,
    userId: string,
    token: string,
    ttlSeconds = SESSION_GUARD_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    const result = await this.redis.set(
      sessionGuardLockKey(workspaceId, userId),
      token,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLock(
    workspaceId: string,
    userId: string,
    token: string,
  ): Promise<void> {
    await this.redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      1,
      sessionGuardLockKey(workspaceId, userId),
      token,
    );
  }

  private parse<T>(raw: string | null): T | null {
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
