/**
 * Escapes a value for safe interpolation into an LDAP search filter
 * (RFC 4515 section 3), so user input like `*)(uid=*` cannot alter the filter.
 */
export function escapeLdapFilterValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\\*()\x00]/g, (ch) =>
    `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

export function buildLdapUserFilter(
  template: string | null | undefined,
  username: string,
): string {
  const escaped = escapeLdapFilterValue(username);
  return template
    ? template.split('{{username}}').join(escaped)
    : `(uid=${escaped})`;
}

/** LDAP attributes may be multi-valued; take the first string value. */
export function firstLdapValue(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first || undefined;
  if (Buffer.isBuffer(first)) return first.toString('utf8') || undefined;
  return undefined;
}
