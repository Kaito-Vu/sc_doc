import { ForbiddenException } from '@nestjs/common';
import { Page } from '@docmost/db/types/entity.types';

export const PAGE_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

// A lock lapses 24h after the page's last update (or the lock itself).
export function isPageLockActive(
  page: Pick<Page, 'isLocked' | 'lockedAt' | 'updatedAt'>,
): boolean {
  if (!page.isLocked) return false;
  const last = Math.max(
    new Date(page.updatedAt).getTime(),
    page.lockedAt ? new Date(page.lockedAt).getTime() : 0,
  );
  return Date.now() - last < PAGE_LOCK_TTL_MS;
}

export function isPageLockedForUser(
  page: Pick<Page, 'isLocked' | 'lockedAt' | 'updatedAt' | 'lockedById'>,
  userId: string,
): boolean {
  return isPageLockActive(page) && page.lockedById !== userId;
}

export function assertPageNotLockedForUser(
  page: Parameters<typeof isPageLockedForUser>[0],
  userId: string,
): void {
  if (isPageLockedForUser(page, userId)) {
    throw new ForbiddenException('Page is locked');
  }
}
