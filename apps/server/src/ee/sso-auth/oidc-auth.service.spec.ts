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
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { SessionService } from '../../core/session/session.service';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { encodeOidcState, decodeOidcState } from './oidc-state.util';

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
  let authProviderRepo: { findById: jest.Mock; findEntraProvider: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    authProviderRepo = { findById: jest.fn(), findEntraProvider: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OidcAuthService,
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        { provide: AuthAccountRepo, useValue: {} },
        { provide: UserRepo, useValue: {} },
        { provide: GroupUserRepo, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: WorkspaceService, useValue: {} },
        { provide: AttachmentService, useValue: {} },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => 'test-secret',
            getAppUrl: () => 'http://localhost:3000',
            isHttps: () => false,
          },
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
    expect(authProviderRepo.findEntraProvider).not.toHaveBeenCalled();
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

  it('resolves via findEntraProvider (not findById) when providerId is omitted', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue(undefined);
    await expect(
      service.buildAuthorizationUrl(undefined, 'ws1'),
    ).rejects.toThrow(NotFoundException);
    expect(authProviderRepo.findEntraProvider).toHaveBeenCalledWith('ws1');
    expect(authProviderRepo.findById).not.toHaveBeenCalled();
  });

  it('accepts a provider with type "azure-ad" and issues a singleton redirect_uri', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'entra-1',
      type: 'azure-ad',
      isEnabled: true,
      oidcIssuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://login.microsoftonline.com/authorize?x=1'),
    );

    const result = await service.buildAuthorizationUrl(undefined, 'ws1');

    expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirect_uri: 'http://localhost:3000/api/sso/oidc/callback',
      }),
    );
    const decoded = decodeOidcState(result.stateCookie, 'test-secret');
    expect(decoded?.providerId).toBe('entra-1');
    expect(decoded?.singleton).toBe(true);
  });

  it('requests the Microsoft Graph User.Read scope for azure-ad providers', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'entra-1',
      type: 'azure-ad',
      isEnabled: true,
      oidcIssuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://login.microsoftonline.com/authorize?x=1'),
    );

    await service.buildAuthorizationUrl(undefined, 'ws1');

    expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: 'openid profile email https://graph.microsoft.com/User.Read',
      }),
    );
  });

  it('does not request the Graph scope for a generic OIDC provider', async () => {
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

    await service.buildAuthorizationUrl('p1', 'ws1');

    expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: 'openid profile email' }),
    );
  });

  it('rejects a resolved provider whose type is neither "oidc" nor "azure-ad"', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'p2',
      type: 'saml',
      isEnabled: true,
      oidcIssuer: 'https://issuer.example.com',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    await expect(
      service.buildAuthorizationUrl(undefined, 'ws1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('uses the providerId-scoped redirect_uri for the generic OIDC flow', async () => {
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
        redirect_uri: 'http://localhost:3000/api/sso/oidc/p1/callback',
      }),
    );
    const decoded = decodeOidcState(result.stateCookie, 'test-secret');
    expect(decoded?.singleton).toBeFalsy();
  });

  it('normalizes an Azure federation metadata URL to the issuer base URL before discovery', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'entra-1',
      type: 'azure-ad',
      isEnabled: true,
      oidcIssuer:
        'https://login.microsoftonline.com/tenant-id/federationmetadata/2007-06/federationmetadata.xml',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://login.microsoftonline.com/authorize?x=1'),
    );

    await service.buildAuthorizationUrl(undefined, 'ws1');

    expect(client.discovery).toHaveBeenCalledWith(
      new URL('https://login.microsoftonline.com/tenant-id/v2.0'),
      'cid',
      'secret',
    );
  });

  it('strips a pasted .well-known/openid-configuration suffix before discovery', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'entra-1',
      type: 'azure-ad',
      isEnabled: true,
      oidcIssuer:
        'https://login.microsoftonline.com/tenant-id/v2.0/.well-known/openid-configuration',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockResolvedValue({});
    (client.buildAuthorizationUrl as jest.Mock).mockReturnValue(
      new URL('https://login.microsoftonline.com/authorize?x=1'),
    );

    await service.buildAuthorizationUrl(undefined, 'ws1');

    expect(client.discovery).toHaveBeenCalledWith(
      new URL('https://login.microsoftonline.com/tenant-id/v2.0'),
      'cid',
      'secret',
    );
  });

  it('wraps a discovery failure in a descriptive BadRequestException', async () => {
    authProviderRepo.findEntraProvider.mockResolvedValue({
      id: 'entra-1',
      type: 'azure-ad',
      isEnabled: true,
      oidcIssuer: 'https://login.microsoftonline.com/wrong-tenant/v2.0',
      oidcClientId: 'cid',
      oidcClientSecret: 'secret',
    });
    (client.discovery as jest.Mock).mockRejectedValue(
      new Error('unexpected HTTP response status code'),
    );

    await expect(
      service.buildAuthorizationUrl(undefined, 'ws1'),
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
  let attachmentService: { uploadUserAvatarFromBuffer: jest.Mock };
  let sessionService: { createSessionAndToken: jest.Mock };
  let auditService: { log: jest.Mock };

  const provider = {
    id: 'p1',
    type: 'oidc',
    isEnabled: true,
    oidcIssuer: 'https://issuer.example.com',
    oidcClientId: 'cid',
    oidcClientSecret: 'secret',
    allowSignup: false,
    avatarSync: false,
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
    attachmentService = {
      uploadUserAvatarFromBuffer: jest.fn().mockResolvedValue({}),
    };
    sessionService = {
      createSessionAndToken: jest.fn().mockResolvedValue('session-token'),
    };
    auditService = { log: jest.fn() };
    (client.discovery as jest.Mock).mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        OidcAuthService,
        { provide: AuthProviderRepo, useValue: authProviderRepo },
        { provide: AuthAccountRepo, useValue: authAccountRepo },
        { provide: UserRepo, useValue: userRepo },
        { provide: GroupUserRepo, useValue: groupUserRepo },
        { provide: SessionService, useValue: sessionService },
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: AttachmentService, useValue: attachmentService },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => 'test-secret',
            getAppUrl: () => 'http://localhost:3000',
            isHttps: () => false,
          },
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
    });

    expect(userRepo.updateLastLogin).toHaveBeenCalledWith('u1', 'ws1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'u1' }),
    );
  });

  describe('avatar sync', () => {
    const azureProvider = { ...provider, type: 'azure-ad', avatarSync: true };
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
    });

    it('is skipped for a generic OIDC provider even with avatarSync true', async () => {
      authProviderRepo.findById.mockResolvedValue({ ...provider, avatarSync: true });
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'sub-123', email: 'user@example.com' }),
        access_token: 'access-token',
      });

      await service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(attachmentService.uploadUserAvatarFromBuffer).not.toHaveBeenCalled();
    });

    it('is skipped for azure-ad when avatarSync is false', async () => {
      authProviderRepo.findById.mockResolvedValue({ ...provider, type: 'azure-ad', avatarSync: false });
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'sub-123', email: 'user@example.com' }),
        access_token: 'access-token',
      });

      await service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads the Graph photo as the user avatar for azure-ad with avatarSync true', async () => {
      authProviderRepo.findById.mockResolvedValue(azureProvider);
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'sub-123', email: 'user@example.com' }),
        access_token: 'access-token',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

      await service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/photo/$value',
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
        }),
      );
      expect(attachmentService.uploadUserAvatarFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', workspaceId: 'ws1', mimeType: 'image/jpeg' }),
      );
    });

    it('never blocks login when the Graph photo fetch fails', async () => {
      authProviderRepo.findById.mockResolvedValue(azureProvider);
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'sub-123', email: 'user@example.com' }),
        access_token: 'access-token',
      });
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
      });

      expect(result.authToken).toBe('session-token');
      expect(attachmentService.uploadUserAvatarFromBuffer).not.toHaveBeenCalled();
    });

    it('never blocks login when the IdP has no photo (404)', async () => {
      authProviderRepo.findById.mockResolvedValue(azureProvider);
      (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
        claims: () => ({ sub: 'sub-123', email: 'user@example.com' }),
        access_token: 'access-token',
      });
      fetchMock.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });

      const result = await service.handleCallback({
        code: 'auth-code',
        state: 's1',
        stateCookie: stateCookieFor(),
        workspaceId: 'ws1',
      });

      expect(result.authToken).toBe('session-token');
      expect(attachmentService.uploadUserAvatarFromBuffer).not.toHaveBeenCalled();
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
    });

    expect(result.redirect).toBe('/');
  });

  it('reconstructs the singleton redirect_uri when the cycle was started via the Entra ID login route', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor({ singleton: true }),
      workspaceId: 'ws1',
    });

    const [, currentUrl] = (client.authorizationCodeGrant as jest.Mock).mock
      .calls[0];
    expect((currentUrl as URL).origin + (currentUrl as URL).pathname).toBe(
      'http://localhost:3000/api/sso/oidc/callback',
    );
  });

  it('reconstructs the providerId-scoped redirect_uri when singleton is not set', async () => {
    (client.authorizationCodeGrant as jest.Mock).mockResolvedValue({
      claims: () => ({ sub: 'sub-123', email: 'user@example.com', name: 'User' }),
      access_token: 'access-token',
    });

    await service.handleCallback({
      code: 'auth-code',
      state: 's1',
      stateCookie: stateCookieFor(),
      workspaceId: 'ws1',
    });

    const [, currentUrl] = (client.authorizationCodeGrant as jest.Mock).mock
      .calls[0];
    expect((currentUrl as URL).origin + (currentUrl as URL).pathname).toBe(
      'http://localhost:3000/api/sso/oidc/p1/callback',
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
