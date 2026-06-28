import { getHookRegistry, HookContext } from './plugin-hooks';

/**
 * Run a plugin hook. Blocking vs non-blocking behavior is enforced by the
 * hook registry implementation (EE layer).
 */
export async function runHook<T extends HookContext>(
  event: string,
  context: T,
): Promise<T> {
  const result = await getHookRegistry().emit(event, context);
  return result as T;
}
