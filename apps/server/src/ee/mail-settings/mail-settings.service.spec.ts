import { decryptSecret, encryptSecret } from '../sso/secret-cipher';

describe('mail password encryption', () => {
  it('is not stored in plaintext and round-trips', () => {
    const enc = encryptSecret('hunter2', 'app-secret');
    expect(enc).not.toContain('hunter2');
    expect(decryptSecret(enc, 'app-secret')).toBe('hunter2');
  });
});
