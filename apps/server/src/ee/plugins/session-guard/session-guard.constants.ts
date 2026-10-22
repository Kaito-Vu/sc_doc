export const SESSION_GUARD_PLUGIN_ID = 'session-guard';
export const SESSION_GUARD_QUEUE = '{session-guard-queue}';
export const SESSION_GUARD_JOB_EXPIRE = 'expire';

export const SESSION_GUARD_DEFAULT_GRACE_SECONDS = 10;
export const SESSION_GUARD_MIN_GRACE_SECONDS = 5;
export const SESSION_GUARD_MAX_GRACE_SECONDS = 60;

export const SESSION_GUARD_STATE_TTL_SECONDS = 180;
export const SESSION_GUARD_ALIVE_TTL_SECONDS = 15;
export const SESSION_GUARD_LOCK_TTL_SECONDS = 10;
export const SESSION_GUARD_LOCK_RETRIES = 25;
export const SESSION_GUARD_LOCK_RETRY_DELAY_MS = 80;
export const SESSION_GUARD_MAX_OTHER_SESSIONS = 100;

export const SESSION_GUARD_CONFLICT_PREFIX = 'session-guard:conflict:';
export const SESSION_GUARD_USER_PREFIX = 'session-guard:user:';
export const SESSION_GUARD_SESSION_PREFIX = 'session-guard:session:';
export const SESSION_GUARD_LOCK_PREFIX = 'session-guard:lock:';

export const sessionGuardConflictKey = (conflictId: string) =>
  `${SESSION_GUARD_CONFLICT_PREFIX}${conflictId}`;

export const sessionGuardUserKey = (workspaceId: string, userId: string) =>
  `${SESSION_GUARD_USER_PREFIX}${workspaceId}:${userId}`;

export const sessionGuardAliveKey = (sessionId: string) =>
  `session-guard:alive:${sessionId}`;

export const sessionGuardSessionKey = (sessionId: string) =>
  `${SESSION_GUARD_SESSION_PREFIX}${sessionId}`;

export const sessionGuardLockKey = (workspaceId: string, userId: string) =>
  `${SESSION_GUARD_LOCK_PREFIX}${workspaceId}:${userId}`;
