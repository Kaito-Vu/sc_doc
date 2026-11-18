import { ForbiddenException } from '@nestjs/common';
import { InvitesDisabledGuard } from './invites-disabled.guard';

const ctx = (url: string, type = 'http') =>
  ({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ raw: { url }, url }) }),
  }) as any;

describe('InvitesDisabledGuard', () => {
  const guard = new InvitesDisabledGuard();

  it.each(['create', 'resend', 'accept', 'link'])(
    'rejects /api/workspace/invites/%s',
    (r) => {
      expect(() => guard.canActivate(ctx(`/api/workspace/invites/${r}`))).toThrow(
        ForbiddenException,
      );
      expect(() =>
        guard.canActivate(ctx(`/api/workspace/invites/${r}?x=1`)),
      ).toThrow(ForbiddenException);
    },
  );

  it.each([
    '/api/workspace/invites',
    '/api/workspace/invites/info',
    '/api/workspace/members',
    '/api/pages/info',
  ])('allows %s', (url) => {
    expect(guard.canActivate(ctx(url))).toBe(true);
  });

  it('ignores non-http contexts', () => {
    expect(guard.canActivate(ctx('/api/workspace/invites/create', 'ws'))).toBe(
      true,
    );
  });
});
