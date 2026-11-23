import * as OTPAuth from 'otpauth';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

export function verifyTotp(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function generateBackupCodes() {
  const backupCodes = Array.from({ length: 10 }, () =>
    randomBytes(4).toString('hex').toUpperCase(),
  );
  const hashedCodes = await Promise.all(
    backupCodes.map((code) => bcrypt.hash(code, 10)),
  );
  return { backupCodes, hashedCodes };
}

/**
 * `consumeBackupCode` must atomically remove the matched hash (persistence
 * stays with the caller) and return whether this call removed it.
 */
export async function verifyCode(
  mfa: any,
  rawCode: unknown,
  consumeBackupCode: (userId: string, hash: string) => Promise<boolean>,
): Promise<boolean> {
  if (typeof rawCode !== 'string') {
    return false;
  }
  const code = rawCode.trim();
  if (/^\d{6}$/.test(code)) {
    return verifyTotp(mfa.secret, code);
  }

  // Backup codes are 8 uppercase hex chars; anything else can't match, so
  // skip the (expensive) bcrypt loop for it.
  const backupCode = code.toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(backupCode) || !mfa.backupCodes?.length) {
    return false;
  }
  for (const hash of mfa.backupCodes as string[]) {
    if (await bcrypt.compare(backupCode, hash)) {
      // Atomic removal: of two concurrent requests with the same code,
      // only the one that actually removes it succeeds.
      return consumeBackupCode(mfa.userId, hash);
    }
  }
  return false;
}
