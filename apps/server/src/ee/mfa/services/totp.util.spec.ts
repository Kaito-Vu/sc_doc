import * as OTPAuth from 'otpauth';
import * as bcrypt from 'bcrypt';
import { generateBackupCodes, verifyCode, verifyTotp } from './totp.util';

const secret = new OTPAuth.Secret({ size: 20 });
const mk = () =>
  new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret });

describe('totp.util', () => {
  describe('verifyTotp', () => {
    it('accepts current code', () => {
      expect(verifyTotp(secret.base32, mk().generate())).toBe(true);
    });
    it('accepts +-1 step, rejects +-2 steps', () => {
      const t = Date.now();
      const at = (d: number) => mk().generate({ timestamp: t + d * 30000 });
      expect(verifyTotp(secret.base32, at(-1))).toBe(true);
      expect(verifyTotp(secret.base32, at(1))).toBe(true);
      expect(verifyTotp(secret.base32, at(-3))).toBe(false);
      expect(verifyTotp(secret.base32, at(3))).toBe(false);
    });
    it('rejects wrong code', () => {
      const good = mk().generate();
      const bad = good === '000000' ? '000001' : '000000';
      expect(verifyTotp(secret.base32, bad)).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('makes 10 unique 8-hex codes with matching bcrypt hashes', async () => {
      const { backupCodes, hashedCodes } = await generateBackupCodes();
      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);
      backupCodes.forEach((c) => expect(c).toMatch(/^[0-9A-F]{8}$/));
      expect(hashedCodes).toHaveLength(10);
      expect(await bcrypt.compare(backupCodes[0], hashedCodes[0])).toBe(true);
    });
  });

  describe('verifyCode', () => {
    it('non-string is false', async () => {
      const consume = jest.fn();
      expect(await verifyCode({ secret: secret.base32 }, 123456, consume)).toBe(
        false,
      );
    });
    it('totp hit (trimmed) and miss', async () => {
      const consume = jest.fn();
      const mfa = { secret: secret.base32 };
      expect(await verifyCode(mfa, ` ${mk().generate()} `, consume)).toBe(true);
      const good = mk().generate();
      expect(
        await verifyCode(mfa, good === '000000' ? '000001' : '000000', consume),
      ).toBe(false);
      expect(consume).not.toHaveBeenCalled();
    });
    it('backup code hit consumes hash (case-insensitive); miss does not', async () => {
      const hash = await bcrypt.hash('ABCDEF12', 4);
      const consume = jest.fn().mockResolvedValue(true);
      const mfa = { userId: 'u1', secret: secret.base32, backupCodes: [hash] };
      expect(await verifyCode(mfa, 'abcdef12', consume)).toBe(true);
      expect(consume).toHaveBeenCalledWith('u1', hash);
      consume.mockClear();
      expect(await verifyCode(mfa, '12345678', consume)).toBe(false);
      expect(await verifyCode(mfa, 'zzzz', consume)).toBe(false);
      expect(consume).not.toHaveBeenCalled();
    });
    it('returns consume result when already consumed', async () => {
      const hash = await bcrypt.hash('ABCDEF12', 4);
      const consume = jest.fn().mockResolvedValue(false);
      expect(
        await verifyCode({ userId: 'u', backupCodes: [hash] }, 'ABCDEF12', consume),
      ).toBe(false);
    });
  });
});
