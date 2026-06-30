import { createHash } from 'node:crypto';

export function computePageHistoryContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content ?? null))
    .digest('hex')
    .slice(0, 8);
}
