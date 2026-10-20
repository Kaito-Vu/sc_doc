import { isChannelEnabled } from './notification-preferences';

describe('isChannelEnabled', () => {
  it('defaults to on, including unconfigurable types', () => {
    expect(isChannelEnabled({}, 'comment.created', 'email')).toBe(true);
    expect(isChannelEnabled({}, 'siem_destination.failing', 'web')).toBe(true);
  });

  it('applies per-channel prefs by group', () => {
    const settings = {
      notificationPrefs: { 'page.lifecycle': { web: true, email: false } },
    };
    expect(isChannelEnabled(settings, 'page.trashed', 'web')).toBe(true);
    expect(isChannelEnabled(settings, 'page.trashed', 'email')).toBe(false);
  });

  it('falls back to the legacy switch for both channels', () => {
    const settings = { notifications: { 'page.updated': false } };
    expect(isChannelEnabled(settings, 'page.updated', 'web')).toBe(false);
    expect(isChannelEnabled(settings, 'page.updated', 'email')).toBe(false);
  });
});
