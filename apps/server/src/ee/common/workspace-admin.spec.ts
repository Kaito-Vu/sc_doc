import { ForbiddenException } from '@nestjs/common';
import { assertCanManageWorkspace, canManageWorkspace } from './workspace-admin';

const factory = (can: boolean) =>
  ({ createForUser: () => ({ cannot: () => !can }) }) as any;

describe('workspace-admin', () => {
  it('canManageWorkspace mirrors the ability', () => {
    expect(canManageWorkspace(factory(true), {} as any, { id: 'w' })).toBe(true);
    expect(canManageWorkspace(factory(false), {} as any, { id: 'w' })).toBe(false);
  });
  it('assertCanManageWorkspace throws when denied', () => {
    expect(() => assertCanManageWorkspace(factory(false), {} as any, { id: 'w' })).toThrow(ForbiddenException);
    expect(() => assertCanManageWorkspace(factory(true), {} as any, { id: 'w' })).not.toThrow();
  });
});
