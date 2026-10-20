import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { Client } from 'ldapts';
import { SsoAuthService } from './sso-auth.service';
import { SsoUserProvisioningService } from './sso-user-provisioning.service';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { SsoService } from '../sso/sso.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { MfaGateService } from '../mfa/services/mfa-gate.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import * as resolverModule from './sso-identity-resolver';

jest.mock('ldapts', () => ({ Client: jest.fn() }));

const workspace = { id: 'ws1' } as any;
const res = {} as any;
const provider = {
  id: 'p-ldap',
  type: 'ldap',
  name: 'Corp LDAP',
  isEnabled: true,
  allowSignup: true,
  ldapUrl: 'ldaps://ldap.test',
  ldapBaseDn: 'dc=corp',
  ldapBindDn: 'cn=svc',
  ldapBindPassword: 'enc',
};
const creds = { username: 'alice', password: 'pw' };
const hasResolver = !!(resolverModule as any).SsoIdentityResolver;
const itNew = hasResolver ? it : it.skip;

describe('SsoAuthService.ldapLogin', () => {
  let service: SsoAuthService;
  let userRepo: any;
  let authAccountRepo: Record<string, jest.Mock>;
  let mfa: { checkAndChallenge: jest.Mock };
  let providerRepo: { findById: jest.Mock };
  let entries: any[];
  let bindImpl: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    entries = [
      { dn: 'uid=alice,dc=corp', mail: 'alice@corp.com', cn: 'Alice', uid: 'alice' },
    ];
    bindImpl = jest.fn().mockResolvedValue(undefined);
    (Client as unknown as jest.Mock).mockImplementation(() => ({
      startTLS: jest.fn(),
      bind: bindImpl,
      search: jest.fn(async () => ({ searchEntries: entries })),
      unbind: jest.fn().mockResolvedValue(undefined),
    }));
    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(undefined),
      insertUser: jest.fn(async (u: any) => ({ id: 'new-user', ...u })),
    };
    authAccountRepo = {
      findByProviderUserId: jest.fn().mockResolvedValue(undefined),
      findByUserAndProvider: jest.fn().mockResolvedValue(undefined),
      findByUserId: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({}),
    };
    mfa = { checkAndChallenge: jest.fn(async (u: any) => ({ user: u })) };
    providerRepo = { findById: jest.fn().mockResolvedValue(provider) };
    const extra = hasResolver ? [(resolverModule as any).SsoIdentityResolver] : [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoAuthService,
        SsoUserProvisioningService,
        ...extra,
        { provide: AuthProviderRepo, useValue: providerRepo },
        { provide: AuthAccountRepo, useValue: authAccountRepo },
        { provide: SsoService, useValue: { decryptSecret: (v: string) => v } },
        { provide: UserRepo, useValue: userRepo },
        { provide: GroupUserRepo, useValue: { addUserToDefaultGroup: jest.fn() } },
        { provide: WorkspaceService, useValue: { addUserToWorkspace: jest.fn() } },
        { provide: MfaGateService, useValue: mfa },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
        {
          provide: KYSELY_MODULE_CONNECTION_TOKEN(),
          useValue: { transaction: () => ({ execute: (fn: any) => fn({}) }) },
        },
      ],
    }).compile();
    service = moduleRef.get(SsoAuthService);
  });

  it('logs in an existing user matched by email (legacy LDAP user, no authAccount)', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'u1', email: 'alice@corp.com' });
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(mfa.checkAndChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      workspace,
      res,
      expect.objectContaining({ method: 'ldap', providerId: 'p-ldap' }),
    );
    expect(userRepo.insertUser).not.toHaveBeenCalled();
  });

  it('provisions a new user when signup is allowed', async () => {
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(userRepo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@corp.com',
        name: 'Alice',
        hasGeneratedPassword: true,
      }),
      expect.anything(),
    );
  });

  it('rejects unknown user when signup is disabled', async () => {
    providerRepo.findById.mockResolvedValue({ ...provider, allowSignup: false });
    await expect(
      service.ldapLogin('p-ldap', creds, workspace, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(userRepo.insertUser).not.toHaveBeenCalled();
  });

  it('rejects failed bind and ambiguous search', async () => {
    bindImpl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('bad'));
    await expect(
      service.ldapLogin('p-ldap', creds, workspace, res),
    ).rejects.toThrow(UnauthorizedException);
    entries = [entries[0], entries[0]];
    await expect(
      service.ldapLogin('p-ldap', creds, workspace, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(mfa.checkAndChallenge).not.toHaveBeenCalled();
  });

  it('uses a synthetic email when the entry has no mail', async () => {
    entries = [{ dn: 'uid=bob,dc=corp', cn: 'Bob', uid: 'bob' }];
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(userRepo.findByEmail).toHaveBeenCalledWith(
      'bob@ws1.ldap.local',
      'ws1',
      expect.anything(),
    );
  });

  // --- behaviour added by SsoIdentityResolver ---

  itNew('links the authAccount (provider + DN) on login of a legacy user', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' });
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(authAccountRepo.upsert).toHaveBeenCalledWith(
      {
        userId: 'u1',
        authProviderId: 'p-ldap',
        providerUserId: 'uid=alice,dc=corp',
        workspaceId: 'ws1',
      },
      expect.anything(),
    );
  });

  itNew('links the authAccount for a newly provisioned user', async () => {
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(authAccountRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'new-user',
        providerUserId: 'uid=alice,dc=corp',
      }),
      expect.anything(),
    );
  });

  itNew('prefers the linked account over email (survives email change)', async () => {
    authAccountRepo.findByProviderUserId.mockResolvedValue({ userId: 'u9' });
    userRepo.findById.mockResolvedValue({ id: 'u9' });
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(mfa.checkAndChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u9' }),
      workspace,
      res,
      expect.anything(),
    );
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  itNew('refuses to take over an account linked to a different provider (e.g. OIDC)', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' });
    authAccountRepo.findByUserId.mockResolvedValue({
      providerName: 'Okta',
      providerType: 'oidc',
    });
    await expect(
      service.ldapLogin('p-ldap', creds, workspace, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(authAccountRepo.upsert).not.toHaveBeenCalled();
    expect(mfa.checkAndChallenge).not.toHaveBeenCalled();
  });

  itNew('refuses re-link when the account is bound to another DN of this provider', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' });
    authAccountRepo.findByUserAndProvider.mockResolvedValue({
      authProviderId: 'p-ldap',
      providerUserId: 'uid=other,dc=corp',
    });
    await expect(
      service.ldapLogin('p-ldap', creds, workspace, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(authAccountRepo.upsert).not.toHaveBeenCalled();
  });

  itNew('same provider, same DN: logs in', async () => {
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' });
    authAccountRepo.findByUserAndProvider.mockResolvedValue({
      authProviderId: 'p-ldap',
      providerUserId: 'uid=alice,dc=corp',
    });
    await service.ldapLogin('p-ldap', creds, workspace, res);
    expect(mfa.checkAndChallenge).toHaveBeenCalled();
  });
});
