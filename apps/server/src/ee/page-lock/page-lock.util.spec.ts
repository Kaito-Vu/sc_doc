import { isPageLockedForUser } from './page-lock.util';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const page = (over = {}) => ({
  isLocked: true,
  lockedById: 'a',
  lockedAt: hoursAgo(1),
  ...over,
});

describe('isPageLockedForUser', () => {
  it('blocks others but not the holder', () => {
    expect(isPageLockedForUser(page(), 'b')).toBe(true);
    expect(isPageLockedForUser(page(), 'a')).toBe(false);
  });

  it('lapses 24h after the lock was taken', () => {
    expect(isPageLockedForUser(page({ lockedAt: hoursAgo(25) }), 'b')).toBe(
      false,
    );
    expect(isPageLockedForUser(page({ lockedAt: hoursAgo(23) }), 'b')).toBe(
      true,
    );
  });

  it('ignores unlocked pages', () => {
    expect(isPageLockedForUser(page({ isLocked: false }), 'b')).toBe(false);
  });
});
