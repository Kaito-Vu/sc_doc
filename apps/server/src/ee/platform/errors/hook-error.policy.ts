import { isHttpException } from '../../../common/errors/is-http-exception.util';

const LEGACY_BLOCKING_CODES = new Set([
  'BOT_DETECTED',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

export function isBlockingHookEvent(event: string): boolean {
  return (
    event.includes(':before') ||
    event.startsWith('auth:before') ||
    event.startsWith('page:before')
  );
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
