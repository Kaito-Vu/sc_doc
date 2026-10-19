import {
  buildLdapUserFilter,
  escapeLdapFilterValue,
  firstLdapValue,
} from './ldap.util';

describe('ldap.util', () => {
  it('escapes RFC 4515 special characters', () => {
    expect(escapeLdapFilterValue('*)(uid=*')).toBe('\\2a\\29\\28uid=\\2a');
    expect(escapeLdapFilterValue('a\\b\x00')).toBe('a\\5cb\\00');
  });

  it('replaces every {{username}} placeholder with the escaped value', () => {
    expect(
      buildLdapUserFilter('(|(uid={{username}})(mail={{username}}))', 'a*'),
    ).toBe('(|(uid=a\\2a)(mail=a\\2a))');
    expect(buildLdapUserFilter(null, 'bob')).toBe('(uid=bob)');
  });

  it('reads the first value of a multi-valued attribute', () => {
    expect(firstLdapValue(['a@x.com', 'b@x.com'])).toBe('a@x.com');
    expect(firstLdapValue('a@x.com')).toBe('a@x.com');
    expect(firstLdapValue([])).toBeUndefined();
  });
});
