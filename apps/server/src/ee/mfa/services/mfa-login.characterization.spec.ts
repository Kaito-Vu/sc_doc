import { MfaService } from './mfa.service';
import { MfaGateService } from './mfa-gate.service';
import { hashPassword } from '../../../common/helpers';
import { AuditEvent } from '../../../common/events/audit-events';

// Characterization of the MFA enforcement rule + cookie options shared by the
// local login path (MfaService) and the SSO path (MfaGateService).
describe('MFA login enforcement', () => {
  const env = {
    isHttps: () => true,
    isCloud: () => false,
    getAppSecret: () => 's',
    getCookieExpiresIn: () => new Date(0),
  };
  let mfaRepo: any, userRepo: any, tokens: any, sessions: any, audit: any, res: any;
  let user: any;

  beforeEach(async () => {
    user = {
      id: 'u1',
      email: 'a@b.c',
      password: await hashPassword('pw'),
      emailVerifiedAt: new Date(),
    };
    mfaRepo = { findByUserId: jest.fn() };
    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(user),
      updateLastLogin: jest.fn(),
    };
    tokens = { generateMfaToken: jest.fn().mockResolvedValue('mfa-jwt') };
    sessions = { createSessionAndToken: jest.fn().mockResolvedValue('auth-jwt') };
    audit = { log: jest.fn(), setActorId: jest.fn(), setActorType: jest.fn() };
    res = { setCookie: jest.fn() };
  });

  const mfaCookie = () => [
    'mfaToken',
    'mfa-jwt',
    expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      expires: expect.any(Date),
    }),
  ];

  describe('MfaService.checkMfaRequirements', () => {
    const run = (ws: any) => {
      const svc = new MfaService(
        mfaRepo, userRepo, tokens, sessions, env as any, {} as any, audit,
      );
      return svc.checkMfaRequirements({ email: 'a@b.c', password: 'pw' }, ws, res);
    };

    it('no MFA and not enforced: logs in', async () => {
      mfaRepo.findByUserId.mockResolvedValue(null);
      await expect(run({ id: 'w', enforceMfa: false })).resolves.toEqual({
        authToken: 'auth-jwt',
      });
      expect(res.setCookie).not.toHaveBeenCalled();
      expect(userRepo.updateLastLogin).toHaveBeenCalledWith('u1', 'w');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.USER_LOGIN,
          metadata: { method: 'local' },
        }),
      );
    });

    it('user has MFA: challenge, no session', async () => {
      mfaRepo.findByUserId.mockResolvedValue({ isEnabled: true });
      await expect(run({ id: 'w', enforceMfa: false })).resolves.toEqual({
        userHasMfa: true,
        requiresMfaSetup: false,
        isMfaEnforced: false,
      });
      expect(tokens.generateMfaToken).toHaveBeenCalledWith(user, 'w', {
        method: 'local',
      });
      expect(res.setCookie).toHaveBeenCalledWith(...mfaCookie());
      expect(sessions.createSessionAndToken).not.toHaveBeenCalled();
      expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('enforced but not set up: requires setup', async () => {
      mfaRepo.findByUserId.mockResolvedValue({ isEnabled: false });
      await expect(run({ id: 'w', enforceMfa: true })).resolves.toEqual({
        userHasMfa: false,
        requiresMfaSetup: true,
        isMfaEnforced: true,
      });
      expect(res.setCookie).toHaveBeenCalledWith(...mfaCookie());
    });
  });

  describe('MfaGateService.checkAndChallenge', () => {
    const run = (ws: any) =>
      new MfaGateService(mfaRepo, tokens, sessions, env as any, audit).checkAndChallenge(
        user, ws, res, { method: 'oidc' } as any,
      );

    it('no MFA and not enforced: session, audit, no cookie', async () => {
      mfaRepo.findByUserId.mockResolvedValue(null);
      await expect(run({ id: 'w' })).resolves.toEqual({
        requiresMfa: false,
        authToken: 'auth-jwt',
      });
      expect(res.setCookie).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.USER_LOGIN }),
      );
    });

    it('user has MFA: challenge with cookie', async () => {
      mfaRepo.findByUserId.mockResolvedValue({ isEnabled: true });
      await expect(run({ id: 'w' })).resolves.toEqual({
        requiresMfa: true,
        userHasMfa: true,
        requiresMfaSetup: false,
        isMfaEnforced: false,
      });
      expect(res.setCookie).toHaveBeenCalledWith(...mfaCookie());
      expect(sessions.createSessionAndToken).not.toHaveBeenCalled();
    });

    it('enforced but not set up: requires setup', async () => {
      mfaRepo.findByUserId.mockResolvedValue(null);
      await expect(run({ id: 'w', enforceMfa: true })).resolves.toEqual({
        requiresMfa: true,
        userHasMfa: false,
        requiresMfaSetup: true,
        isMfaEnforced: true,
      });
    });
  });
});
