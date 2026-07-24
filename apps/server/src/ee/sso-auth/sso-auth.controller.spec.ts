import { Test } from '@nestjs/testing';
import { SsoAuthController } from './sso-auth.controller';
import { SsoAuthService } from './sso-auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';

describe('SsoAuthController.oidcLogin', () => {
  it('sets the oidc_state cookie and returns a dynamic redirect to the authorization url', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        {
          provide: OidcAuthService,
          useValue: {
            buildAuthorizationUrl: jest.fn().mockResolvedValue({
              url: 'https://idp.example.com/authorize?foo=bar',
              stateCookie: 'signed-state-cookie',
            }),
          },
        },
        {
          provide: EnvironmentService,
          useValue: { getAppUrl: () => 'http://localhost:3000' },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const oidcAuthService = moduleRef.get(OidcAuthService);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };

    const result = await controller.oidcLogin(
      'p1',
      '/dashboard',
      { id: 'ws1' } as any,
      res,
    );

    // Manually calling reply.redirect() via @Res() does not reliably produce
    // a 302 in this NestJS+Fastify version combo (verified with a minimal
    // repro): the status/Location are set synchronously but the header
    // flush to the socket happens asynchronously, so it can be silently
    // downgraded to 200 OK. @Redirect() with a dynamic {url, statusCode}
    // return value goes through Nest's own response pipeline instead and
    // does not have this issue - this is the verified fix for the "blank
    // white screen" bug, so the handler must return the redirect target
    // rather than call res.redirect() itself.
    expect(result).toEqual({
      url: 'https://idp.example.com/authorize?foo=bar',
      statusCode: 302,
    });

    expect(oidcAuthService.buildAuthorizationUrl).toHaveBeenCalledWith(
      'p1',
      'ws1',
      '/dashboard',
    );
    expect(res.setCookie).toHaveBeenCalledWith(
      'oidc_state',
      'signed-state-cookie',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('returns a redirect to /login?error=sso_failed when buildAuthorizationUrl throws', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        {
          provide: OidcAuthService,
          useValue: {
            buildAuthorizationUrl: jest
              .fn()
              .mockRejectedValue(new Error('discovery failed')),
          },
        },
        {
          provide: EnvironmentService,
          useValue: { getAppUrl: () => 'http://localhost:3000' },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };

    const result = await controller.oidcLogin(
      'p1',
      undefined,
      { id: 'ws1' } as any,
      res,
    );

    expect(result).toEqual({
      url: 'http://localhost:3000/login?error=sso_failed',
      statusCode: 302,
    });
  });
});

describe('SsoAuthController.oidcCallback', () => {
  it('returns a redirect to /login?error=sso_failed when the state cookie is missing', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        { provide: OidcAuthService, useValue: { handleCallback: jest.fn() } },
        {
          provide: EnvironmentService,
          useValue: { getAppUrl: () => 'http://localhost:3000' },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };
    const req: any = { cookies: {} };

    const result = await controller.oidcCallback('code1', 'state1', { id: 'ws1' } as any, res, req);

    expect(result).toEqual({
      url: 'http://localhost:3000/login?error=sso_failed',
      statusCode: 302,
    });
    expect(res.clearCookie).toHaveBeenCalledWith('oidc_state', { path: '/' });
  });

  it('sets authToken cookie and returns a redirect to the app on success', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        {
          provide: OidcAuthService,
          useValue: {
            handleCallback: jest.fn().mockResolvedValue({
              requiresMfa: false,
              authToken: 'jwt-token',
              redirect: '/dashboard',
            }),
          },
        },
        {
          provide: EnvironmentService,
          useValue: {
            getAppUrl: () => 'http://localhost:3000',
            getCookieExpiresIn: () => new Date('2030-01-01'),
            isHttps: () => false,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const oidcAuthService = moduleRef.get(OidcAuthService);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };
    const req: any = { cookies: { oidc_state: 'signed-state-cookie' } };
    const workspace = { id: 'ws1' } as any;

    const result = await controller.oidcCallback('code1', 'state1', workspace, res, req);

    expect(result).toEqual({
      url: 'http://localhost:3000/dashboard',
      statusCode: 302,
    });
    expect(oidcAuthService.handleCallback).toHaveBeenCalledWith({
      code: 'code1',
      state: 'state1',
      stateCookie: 'signed-state-cookie',
      workspaceId: 'ws1',
      workspace,
      res,
    });
    expect(res.setCookie).toHaveBeenCalledWith(
      'authToken',
      'jwt-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith('oidc_state', { path: '/' });
  });

  it('returns a redirect to /login/mfa when MFA is required', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        {
          provide: OidcAuthService,
          useValue: {
            handleCallback: jest.fn().mockResolvedValue({
              requiresMfa: true,
            }),
          },
        },
        {
          provide: EnvironmentService,
          useValue: { getAppUrl: () => 'http://localhost:3000' },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };
    const req: any = { cookies: { oidc_state: 'signed-state-cookie' } };

    const result = await controller.oidcCallback(
      'code1',
      'state1',
      { id: 'ws1' } as any,
      res,
      req,
    );

    expect(result).toEqual({
      url: 'http://localhost:3000/login/mfa',
      statusCode: 302,
    });
  });
});

describe('SsoAuthController.entraIdCallback', () => {
  it('routes through the same finishOidcLogin flow as oidcCallback', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SsoAuthController],
      providers: [
        { provide: SsoAuthService, useValue: {} },
        {
          provide: OidcAuthService,
          useValue: {
            handleCallback: jest.fn().mockResolvedValue({
              requiresMfa: false,
              authToken: 'jwt-token',
              redirect: '/',
            }),
          },
        },
        {
          provide: EnvironmentService,
          useValue: {
            getAppUrl: () => 'http://localhost:3000',
            getCookieExpiresIn: () => new Date('2030-01-01'),
            isHttps: () => false,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(SsoAuthController);
    const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };
    const req: any = { cookies: { oidc_state: 'signed-state-cookie' } };

    const result = await controller.entraIdCallback(
      'code1',
      'state1',
      { id: 'ws1' } as any,
      res,
      req,
    );

    expect(result).toEqual({ url: 'http://localhost:3000/', statusCode: 302 });
  });
});
