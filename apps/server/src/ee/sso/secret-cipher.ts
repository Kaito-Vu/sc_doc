import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

export const SECRET_ENC_PREFIX = 'enc:';

/** AES-256-GCM key = sha256(APP_SECRET). */
export function getSecretEncryptionKey(appSecret: string): Buffer {
  return createHash('sha256').update(appSecret).digest();
}

/** Layout: 'enc:' + base64(iv[12] | tag[16] | ciphertext). */
export function encryptSecret(plain: string, appSecret: string): string {
  const key = getSecretEncryptionKey(appSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    SECRET_ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
  );
}

export function decryptSecret(value: string, appSecret: string): string {
  if (!value.startsWith(SECRET_ENC_PREFIX)) {
    // Tương thích ngược với secret đã lưu plaintext trước khi bật mã hoá.
    return value;
  }
  const raw = Buffer.from(value.slice(SECRET_ENC_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const key = getSecretEncryptionKey(appSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
