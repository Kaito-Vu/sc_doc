import { BlockList, isIP } from 'node:net';

export interface SessionGuardExemptions {
  exemptUserIds?: unknown;
  exemptGroupIds?: unknown;
  exemptRoles?: unknown;
  trustedIps?: unknown;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

/**
 * True when `ip` falls in one of the admin's trusted addresses/CIDR ranges.
 * Malformed entries are skipped, never treated as "match everything".
 */
export function isTrustedIp(ip: string | null, trustedIps: unknown): boolean {
  const version = ip ? isIP(ip) : 0;
  if (!ip || !version) return false;

  const list = new BlockList();
  for (const entry of strings(trustedIps).slice(0, 100)) {
    const [addr, prefix] = entry.trim().split('/');
    const entryVersion = isIP(addr);
    if (!entryVersion) continue;
    const type = entryVersion === 4 ? 'ipv4' : 'ipv6';
    try {
      if (prefix === undefined) list.addAddress(addr, type);
      else list.addSubnet(addr, Number(prefix), type);
    } catch {
      // invalid prefix: ignore this rule
    }
  }

  return list.check(ip, version === 4 ? 'ipv4' : 'ipv6');
}

/** Cheap, DB-free exemption checks; group membership is checked by the caller. */
export function isUserExempt(
  config: SessionGuardExemptions | undefined,
  user: { id: string; role?: string | null },
  newIp: string | null,
): boolean {
  if (!config) return false;
  if (strings(config.exemptUserIds).includes(user.id)) return true;
  if (user.role && strings(config.exemptRoles).includes(user.role)) return true;
  return isTrustedIp(newIp, config.trustedIps);
}
