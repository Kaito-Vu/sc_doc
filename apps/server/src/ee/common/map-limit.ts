/**
 * Run `fn` over `items` with at most `limit` in flight. After the first
 * failure no new item is started (in-flight ones finish) and the error is
 * rethrown, so a canceled import stops pulling work.
 */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failed && next < items.length) {
        try {
          await fn(items[next++]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
}
