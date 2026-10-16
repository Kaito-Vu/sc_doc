import { ForbiddenException } from '@nestjs/common';
import { Page } from '@docmost/db/types/entity.types';
import { isPageLockEnabled } from './page-lock.enabled';

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

type LockablePage = Parameters<typeof isPageLockedForUser>[0] &
  Pick<Page, 'workspaceId'>;

// Same as isPageLockedForUser, but only when the plugin is enabled.
export async function isPageLockEnforced(
  page: LockablePage,
  userId: string,
): Promise<boolean> {
  return (
    isPageLockedForUser(page, userId) &&
    (await isPageLockEnabled(page.workspaceId))
  );
}

export async function assertPageNotLockedForUser(
  page: LockablePage,
  userId: string,
): Promise<void> {
  if (await isPageLockEnforced(page, userId)) {
    throw new ForbiddenException('Page is locked');
  }
}
