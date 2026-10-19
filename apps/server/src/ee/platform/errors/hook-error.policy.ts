import { isHttpException } from '../../../common/errors/is-http-exception.util';

const LEGACY_BLOCKING_CODES = new Set([
  'BOT_DETECTED',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

export function isBlockingHookEvent(event: string): boolean {
  // Covers auth:before*, page:before* and any other *:before* hook.
  return event.includes(':before');
}

export function shouldPropagateHookError(
  event: string,
  error: unknown,
): boolean {
  if (isBlockingHookEvent(event) && isHttpException(error)) {
    return true;
  }

  const code = (error as { code?: string })?.code;
  if (code && LEGACY_BLOCKING_CODES.has(code)) {
    return true;
  }

  return false;
}
