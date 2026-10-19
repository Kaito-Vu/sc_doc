import * as bcrypt from 'bcrypt';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { hashPassword } from '../../../common/helpers';

describe('MfaService', () => {
  let userMfaRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let service: MfaService;

  beforeEach(() => {
    userMfaRepo = {
      findByUserId: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      consumeBackupCode: jest.fn(),
    };
    userRepo = { findById: jest.fn() };
    service = new MfaService(
      userMfaRepo as any,
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
    );
  });

  describe('disable', () => {
    it('requires the current password for users who set their own', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u1',
        password: await hashPassword('right'),
        hasGeneratedPassword: false,
      });

      await expect(service.disable('u1', 'ws1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.disable('u1', 'ws1', 'wrong')).rejects.toThrow(
        ForbiddenException,
      );
      expect(userMfaRepo.update).not.toHaveBeenCalled();

      await service.disable('u1', 'ws1', 'right');
      expect(userMfaRepo.update).toHaveBeenCalled();
    });

    it('skips the password check for SSO users with a generated password', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u1',
        password: 'x',
        hasGeneratedPassword: true,
      });
      await service.disable('u1', 'ws1');
      expect(userMfaRepo.update).toHaveBeenCalled();
    });
  });

  it('refuses to re-run setup while MFA is enabled', async () => {
    userMfaRepo.findByUserId.mockResolvedValue({ isEnabled: true });
    await expect(
      service.setup({ id: 'u1', email: 'a@b.c' } as any, { id: 'ws1' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(userMfaRepo.upsert).not.toHaveBeenCalled();
  });

  describe('backup codes', () => {
    const verify = (mfa: any, code: unknown) =>
      (service as any).verifyCode(mfa, code);

    it('accepts a backup code case-insensitively and consumes it atomically', async () => {
      const hash = await bcrypt.hash('ABCDEF12', 4);
      const mfa = { userId: 'u1', backupCodes: [hash] };

      userMfaRepo.consumeBackupCode.mockResolvedValue(true);
      await expect(verify(mfa, 'abcdef12')).resolves.toBe(true);
      expect(userMfaRepo.consumeBackupCode).toHaveBeenCalledWith('u1', hash);

      // A concurrent request that lost the race must fail.
      userMfaRepo.consumeBackupCode.mockResolvedValue(false);
      await expect(verify(mfa, 'ABCDEF12')).resolves.toBe(false);
    });

    it('rejects malformed input without throwing', async () => {
      const mfa = { userId: 'u1', backupCodes: ['x'] };
      await expect(verify(mfa, undefined)).resolves.toBe(false);
      await expect(verify(mfa, { $ne: 1 })).resolves.toBe(false);
      await expect(verify(mfa, 'not-a-code')).resolves.toBe(false);
    });
  });
});
