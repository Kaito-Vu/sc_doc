/* eslint-disable @typescript-eslint/no-require-imports -- require() needed inside jest.isolateModules */
// Fresh module state per case: plugin-enabled keeps a module-level service.
type Mode = 'enabled' | 'disabled' | 'unwired';
function load(mode: Mode) {
  let util: typeof import('./page-lock.util');
  jest.isolateModules(() => {
    if (mode !== 'unwired') {
      const { setPluginConfigService } = require('../plugins/plugin-enabled');
      setPluginConfigService({
        isEnabled: jest.fn().mockResolvedValue(mode === 'enabled'),
      });
    }
    util = require('./page-lock.util');
  });
  return util!;
}

const page = (hoursAgo = 1) => ({
  workspaceId: 'w',
  isLocked: true,
  lockedById: 'locker',
  lockedAt: new Date(Date.now() - hoursAgo * 3600_000),
});

describe('page lock enforcement (current behavior)', () => {
  const cases: [Mode, string, boolean][] = [
    ['enabled', 'other', true],
    ['enabled', 'locker', false],
    ['disabled', 'other', false],
    ['disabled', 'locker', false],
    // KNOWN ISSUE: plugin config service never wired => lock not enforced.
    ['unwired', 'other', false],
    ['unwired', 'locker', false],
  ];

  it.each(cases)('%s / %s => enforced=%s', async (mode, user, expected) => {
    const u = load(mode);
    expect(await u.isPageLockEnforced(page(), user)).toBe(expected);
    const assertion = u.assertPageNotLockedForUser(page(), user);
    if (expected) {
      await expect(assertion).rejects.toMatchObject({
        status: 403,
        message: 'Page is locked',
      });
    } else {
      await expect(assertion).resolves.toBeUndefined();
    }
  });

  it('TTL: lock older than 24h is not enforced even when enabled', async () => {
    const u = load('enabled');
    expect(u.PAGE_LOCK_TTL_MS).toBe(24 * 3600_000);
    expect(await u.isPageLockEnforced(page(23), 'other')).toBe(true);
    expect(await u.isPageLockEnforced(page(25), 'other')).toBe(false);
    await expect(
      u.assertPageNotLockedForUser(page(25), 'other'),
    ).resolves.toBeUndefined();
  });
});
