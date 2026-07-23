import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as client from 'openid-client';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { OidcAuthService, isSafeRedirectPath } from './oidc-auth.service';
import { AuthProviderRepo } from '../sso/auth-provider.repo';
import { AuthAccountRepo } from '../sso/auth-account.repo';
import { SsoService } from '../sso/sso.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { MfaGateService } from '../mfa/services/mfa-gate.service';
import { OidcProviderStrategyFactory } from './oidc-provider-strategy.factory';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { encodeOidcState, decodeOidcState } from './oidc-state.util';

const genericStrategyStub = {
  flavor: 'generic' as const,
  getExtraScopes: () => [],
  normalizeIssuer: (url: URL) => url,
  fetchAvatar: async () => undefined,
};

const fakeWorkspace = { id: 'ws1', enforceMfa: false } as any;
const fakeRes = { setCookie: jest.fn(), clearCookie: jest.fn() } as any;

jest.mock('openid-client', () => {
  const actual = jest.requireActual('openid-client');
  return {
    ...actual,
    discovery: jest.fn(),
    authorizationCodeGrant: jest.fn(),
    buildAuthorizationUrl: jest.fn(),
  };
});

// executeTx starts a real Kysely transaction when no trx is passed in; stub
// the injected connection so it just invokes the callback with a fake trx.
const fakeDb = {
  transaction: () => ({
    execute: (fn: (trx: unknown) => unknown) => fn({}),
  }),
};

describe('OidcAuthService.buildAuthorizationUrl', () => {
  let service: OidcAuthService;
  let authProviderRepo: { findById: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    authProviderRepo = { findById: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OidcAuthService,
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        { provide: AuthAccountRepo, useValue: {} },
        { provide: SsoService, useValue: { decryptSecret: (v: string) => v } },
        { provide: UserRepo, useValue: {} },
        { provide: GroupUserRepo, useValue: {} },
        { provide: WorkspaceService, useValue: {} },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => 'test-secret',
            getAppUrl: () => 'http://localhost:3000',
            isHttps: () => false,
          },
        },
        { provide: AttachmentService, useValue: {} },
        { provide: MfaGateService, useValue: { checkAndChallenge: jest.fn() } },
        {
          provide: OidcProviderStrategyFactory,
          useValue: { create: () => genericStrategyStub },
        },
        { provide: AUDIT_SERVICE, useValue: { log: jest.fn() } },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: fakeDb },
      ],
    }).compile();
    service = moduleRef.get(OidcAuthService);
  });

  it('throws NotFoundException when provider is missing', async () => {
    authProviderRepo.findById.mockResolvedValue(undefined);
    await expect(
      service.buildAuthorizationUrl('p1', 'ws1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a resolved provider whose type is not "oidc"', async () => {
    authProviderRepo.findById.mockResolvedValue({
      id: 'p1',
      type: 'saml',
      isEnabled: true,
      oidcIssuer: 'https://issuer.example.com',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    await expect(
      service.buildAuthorizationUrl('p1', 'ws1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when oidcIssuer is not configured', async () => {
    authProviderRepo.findById.mockResolvedValue({
      id: 'p1',
      type: 'oidc',
      isEnabled: true,
      oidcIssuer: null,
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    await expect(
      service.buildAuthorizationUrl('p1', 'ws1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses the providerId-scoped redirect_uri and requests the generic OIDC scope', async () => {
    authProviderRepo.findById.mockResolvedValue({
      id: 'p1',
      type: 'oidc',
      isEnabled: true,
      oidcIssuer: 'https://issuer.example.com',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://issuer.example.com/authorize?x=1'),
    );

    const result = await service.buildAuthorizationUrl('p1', 'ws1');

    expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirect_uri: 'http://localhost:3000/api/sso/oidc/callback',
        scope: 'openid profile email',
      }),
    );
    const decoded = decodeOidcState(result.stateCookie, 'test-secret');
    expect(decoded?.providerId).toBe('p1');
  });

  it('strips a pasted .well-known/openid-configuration suffix before discovery', async () => {
    authProviderRepo.findById.mockResolvedValue({
      id: 'p1',
      type: 'oidc',
      isEnabled: true,
      oidcIssuer: 'https://issuer.example.com/.well-known/openid-configuration',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://issuer.example.com/authorize?x=1'),
    );

    await service.buildAuthorizationUrl('p1', 'ws1');

    expect(client.discovery).toHaveBeenCalledWith(
      new URL('https://issuer.example.com'),
      'cid',
      'secret',
    );
  });

  it('wraps a discovery failure in a descriptive BadRequestException', async () => {
    authProviderRepo.findById.mockResolvedValue({
      id: 'p1',
      type: 'oidc',
      isEnabled: true,
      oidcIssuer: 'https://issuer.example.com',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockRejectedValue(
      new Error('unexpected HTTP response status code'),
    );

    await expect(
      service.buildAuthorizationUrl('p1', 'ws1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OidcAuthService.handleCallback', () => {
  let service: OidcAuthService;
  let authProviderRepo: { findById: jest.Mock };
  let authAccountRepo: { findByProviderUserId: jest.Mock; upsert: jest.Mock };
  let userRepo: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    insertUser: jest.Mock;
    updateLastLogin: jest.Mock;
  };
  let groupUserRepo: { addUserToDefaultGroup: jest.Mock };
  let workspaceService: { addUserToWorkspace: jest.Mock };
  let mfaGateService: { checkAndChallenge: jest.Mock };
  let auditService: { log: jest.Mock };

  const provider = {
    id: 'p1',
    type: 'oidc',
    isEnabled: true,
    oidcIssuer: 'https://issuer.example.com',
    oidcClientId: 'cid',
    oidcClientSecret: 'secret',
    allowSignup: false,
  };

  const user = { id: 'u1', email: 'user@example.com', workspaceId: 'ws1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    authProviderRepo = { findById: jest.fn().mockResolvedValue(provider) };
    authAccountRepo = {
      findByProviderUserId: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({}),
    };
    userRepo = {
      findById: jest.fn().mockResolvedValue(user),
      findByEmail: jest.fn().mockResolvedValue(user),
      insertUser: jest.fn().mockResolvedValue(user),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    groupUserRepo = { addUserToDefaultGroup: jest.fn().mockResolvedValue(undefined) };
    workspaceService = { addUserToWorkspace: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn() };
    mfaGateService = {
      checkAndChallenge: jest.fn().mockImplementation(async () => {
        auditService.log({
          event: 'user.login',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { method: 'oidc' },
        });
        return { requiresMfa: false, authToken: 'session-token' };
      }),
    };
    (client.discovery as jest.Mock).mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        OidcAuthService,
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        { provide: AuthAccountRepo, useValue: authAccountRepo },
        { provide: SsoService, useValue: { decryptSecret: (v: string) => v } },
        { provide: UserRepo, useValue: userRepo },
        { provide: GroupUserRepo, useValue: groupUserRepo },
        { provide: WorkspaceService, useValue: workspaceService },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => 'test-secret',
            getAppUrl: () => 'http://localhost:3000',
            isHttps: () => false,
          },
        },
        { provide: AttachmentService, useValue: {} },
        { provide: MfaGateService, useValue: mfaGateService },
        {
          provide: OidcProviderStrategyFactory,
          useValue: { create: () => genericStrategyStub },
        },
        { provide: AUDIT_SERVICE, useValue: auditService },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: fakeDb },
      ],
    }).compile();
    service = moduleRef.get(OidcAuthService);
  });

  function stateCookieFor(overrides: Record<string, unknown> = {}) {
    return encodeOidcState(
      {
        providerId: 'p1',
        nonce: 'n1',
        state: 's1',
        codeVerifier: 'verifier-abc',
        ...overrides,
      },
      'test-secret',
    );
  }

  it('throws BadRequestException when state does not match the cookie', async () => {
    await expect(
      service.handleCallback({
        code: 'auth-code',
        state: 's2',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when the decoded state is missing codeVerifier', async () => {
    const stateCookie = encodeOidcState(
      { providerId: 'p1', nonce: 'n1', state: 's1' },
      'test-secret',
    );
    await expect(
      service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie,
        workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the ID token has no subject claim', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await expect(
      service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves via the linked authAccounts row without falling back to email lookup', async () => {
    authAccountRepo.findByProviderUserId.mockResolvedValue({
      userId: 'u1',
      authProviderId: 'p1',
      providerUserId: 'sub-123',
    });
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(authAccountRepo.findByProviderUserId).toHaveBeenCalledWith(
      'p1',
      'sub-123',
      'ws1',
      expect.anything(),
    );
    expect(userRepo.findById).toHaveBeenCalledWith('u1', 'ws1', { trx: expect.anything() });
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    // Still re-links (upserts) so the account row stays current.
    expect(authAccountRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', authProviderId: 'p1', providerUserId: 'sub-123' }),
      expect.anything(),
    );
  });

  it('falls back to email lookup when no authAccounts link exists, then links it for next time', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('user@example.com', 'ws1', {
      trx: expect.anything(),
    });
    expect(authAccountRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', providerUserId: 'sub-123' }),
      expect.anything(),
    );
  });

  it('provisions a new user (workspace + default group) when allowSignup is true and nothing matched', async () => {
    authProviderRepo.findById.mockResolvedValue({ ...provider, allowSignup: true });
    userRepo.findByEmail.mockResolvedValue(undefined);
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-new', email: 'new@example.com', name: 'New User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(userRepo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', workspaceId: 'ws1' }),
      expect.anything(),
    );
    expect(workspaceService.addUserToWorkspace).toHaveBeenCalledWith(
      'u1',
      'ws1',
      undefined,
      expect.anything(),
    );
    expect(groupUserRepo.addUserToDefaultGroup).toHaveBeenCalledWith(
      'u1',
      'ws1',
      expect.anything(),
    );
  });

  it('throws UnauthorizedException when nothing matched and allowSignup is false', async () => {
    userRepo.findByEmail.mockResolvedValue(undefined);
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-new', email: 'new@example.com', name: 'New User' }),
      access_token: 'access-token',
    });

    await expect(
      service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(userRepo.insertUser).not.toHaveBeenCalled();
  });

  it('updates last login and logs a USER_LOGIN audit event on success', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(userRepo.updateLastLogin).toHaveBeenCalledWith('u1', 'ws1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'u1' }),
    );
  });

  it('falls back to preferred_username when the email claim is absent', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', preferred_username: 'user@example.com' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('user@example.com', 'ws1', {
      trx: expect.anything(),
    });
  });

  it('passes the real pkceCodeVerifier through to authorizationCodeGrant', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    const result = await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(URL),
      expect.objectContaining({
        pkceCodeVerifier: 'verifier-abc',
        expectedState: 's1',
        expectedNonce: 'n1',
      }),
    );
    expect(result.authToken).toBe('session-token');
  });

  it('falls back to / for an unsafe redirect and passes through a safe one', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    const result = await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor({ redirect: '@evil.com' }),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    expect(result.redirect).toBe('/');
  });

  it('reconstructs the providerId-scoped redirect_uri for the token exchange', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
        workspace: fakeWorkspace,
        res: fakeRes,
    });

    const [, currentUrl] = (client.authorizationCodeGrant as jest.Mock).mock
      .calls[0];
    expect((currentUrl as URL).origin + (currentUrl as URL).pathname).toBe(
      'http://localhost:3000/api/sso/oidc/callback',
    );
  });
});

describe('isSafeRedirectPath', () => {
  it('accepts a normal relative path', () => {
    expect(isSafeRedirectPath('/dashboard')).toBe(true);
  });

  it('rejects protocol-relative urls', () => {
    expect(isSafeRedirectPath('//evil.com')).toBe(false);
  });

  it('rejects userinfo-style hosts', () => {
    expect(isSafeRedirectPath('@evil.com')).toBe(false);
  });

  it('rejects values containing a scheme', () => {
    expect(isSafeRedirectPath('http://evil.com')).toBe(false);
  });

  it('rejects paths containing a backslash', () => {
    expect(isSafeRedirectPath('/\\evil.com')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });
});
