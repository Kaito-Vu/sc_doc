import { isPageLockedForUser } from './page-lock.util';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const page = (over = {}) => ({
  isLocked: true,
  lockedById: 'a',
  lockedAt: hoursAgo(1),
  updatedAt: hoursAgo(1),
  ...over,
});

describe('isPageLockedForUser', () => {
  it('blocks others but not the holder', () => {
    expect(isPageLockedForUser(page(), 'b')).toBe(true);
    expect(isPageLockedForUser(page(), 'a')).toBe(false);
  });

  it('lapses 24h after the last update', () => {
    const old = { lockedAt: hoursAgo(30), updatedAt: hoursAgo(25) };
    expect(isPageLockedForUser(page(old), 'b')).toBe(false);
    // a fresh edit by the holder extends the lock
    expect(
      isPageLockedForUser(page({ ...old, updatedAt: hoursAgo(2) }), 'b'),
    ).toBe(true);
  });

  it('ignores unlocked pages', () => {
    expect(isPageLockedForUser(page({ isLocked: false }), 'b')).toBe(false);
  });
});
