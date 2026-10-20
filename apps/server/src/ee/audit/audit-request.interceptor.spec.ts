import { throwError, of, lastValueFrom } from 'rxjs';
import { AuditRequestInterceptor } from './audit-request.interceptor';

function setup(request: any) {
  const cls = {
    get: jest.fn().mockReturnValue({
      workspaceId: 'w1',
      actorId: request.actorId,
      actorType: 'user',
    }),
    set: jest.fn(),
  };
  const audit = {
    hasLoggedInRequest: jest.fn().mockReturnValue(false),
    logWithContext: jest.fn(),
  };
  const interceptor = new AuditRequestInterceptor(cls as any, audit as any);
  const ctx: any = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', params: {}, ...request }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  };
  return { interceptor, ctx, audit };
}

describe('AuditRequestInterceptor', () => {
  it('redacts secrets and omits document content', async () => {
    const { interceptor, ctx, audit } = setup({
      url: '/api/pages/update',
      actorId: 'u1',
      body: { pageId: 'p1', title: 'T', content: 'secret text', newPassword: 'x' },
    });
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(1) }));

    const meta = audit.logWithContext.mock.calls[0][0].metadata;
    expect(meta.body).toEqual({
      pageId: 'p1',
      title: 'T',
      content: '[omitted]',
      newPassword: '[redacted]',
    });
  });

  it('ignores unauthenticated requests', async () => {
    const { interceptor, ctx, audit } = setup({ url: '/api/auth/login' });
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(1) }));
    expect(audit.logWithContext).not.toHaveBeenCalled();
  });

  it('skips 404 noise but keeps 403 denials', async () => {
    for (const [status, expected] of [[404, 0], [403, 1]] as const) {
      const { interceptor, ctx, audit } = setup({
        url: '/api/pages/delete',
        actorId: 'u1',
      });
      await lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => ({ status, message: 'x' })),
        }),
      ).catch(() => undefined);
      expect(audit.logWithContext).toHaveBeenCalledTimes(expected);
    }
  });
});
