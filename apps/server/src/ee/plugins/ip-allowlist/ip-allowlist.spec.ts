import { isTrustedIp } from '../session-guard/session-guard.exemptions';

describe('ip allowlist matching', () => {
  const list = ['203.0.113.5', '10.0.0.0/8', '2001:db8::/32'];
  it('allows listed addresses and ranges', () => {
    expect(isTrustedIp('203.0.113.5', list)).toBe(true);
    expect(isTrustedIp('10.2.3.4', list)).toBe(true);
    expect(isTrustedIp('2001:db8::1', list)).toBe(true);
  });
  it('rejects others and missing ip', () => {
    expect(isTrustedIp('198.51.100.1', list)).toBe(false);
    expect(isTrustedIp(null, list)).toBe(false);
  });
});
