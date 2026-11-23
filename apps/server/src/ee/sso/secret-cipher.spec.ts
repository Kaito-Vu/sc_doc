import {
  decryptSecret,
  encryptSecret,
  getSecretEncryptionKey,
} from './secret-cipher';
import { createHash } from 'crypto';

describe('secret-cipher', () => {
  const KEY = 'app-secret-1';

  it('key is sha256(appSecret)', () => {
    expect(getSecretEncryptionKey(KEY)).toEqual(
      createHash('sha256').update(KEY).digest(),
    );
  });

  it('round-trips with enc: prefix and iv|tag|ct layout', () => {
    const enc = encryptSecret('hunter2', KEY);
    expect(enc.startsWith('enc:')).toBe(true);
    expect(Buffer.from(enc.slice(4), 'base64').length).toBe(12 + 16 + 7);
    expect(decryptSecret(enc, KEY)).toBe('hunter2');
    expect(encryptSecret('hunter2', KEY)).not.toBe(enc); // random IV
  });

  it('throws when ciphertext is tampered', () => {
    const enc = encryptSecret('hunter2', KEY);
    const raw = Buffer.from(enc.slice(4), 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret('enc:' + raw.toString('base64'), KEY)).toThrow();
  });

  it('throws when tag is tampered', () => {
    const raw = Buffer.from(encryptSecret('hunter2', KEY).slice(4), 'base64');
    raw[12] ^= 0xff;
    expect(() => decryptSecret('enc:' + raw.toString('base64'), KEY)).toThrow();
  });

  it('passes legacy plaintext through unchanged', () => {
    expect(decryptSecret('plain-legacy', KEY)).toBe('plain-legacy');
  });

  it('throws with the wrong key', () => {
    const enc = encryptSecret('hunter2', KEY);
    expect(() => decryptSecret(enc, 'other-secret')).toThrow();
  });
});
