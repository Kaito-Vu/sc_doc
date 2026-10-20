import { AuditLogService } from './audit-log.service';

function setup() {
  const execute = jest.fn().mockResolvedValue(undefined);
  const db: any = {
    insertInto: jest.fn(() => ({
      values: jest.fn(() => ({ execute })),
    })),
  };
  const cls: any = { get: jest.fn(), set: jest.fn() };
  const service = new AuditLogService(db, cls, {} as any);
  return { service, db };
}

const ctx = { workspaceId: 'w1', actorId: 'u1', actorType: 'user' as const };

describe('AuditLogService coalescing', () => {
  it('records chatty page.updated once per actor/page within the window', () => {
    const { service, db } = setup();
    const payload = {
      event: 'page.updated',
      resourceType: 'page',
      resourceId: 'p1',
    } as any;

    service.logWithContext(payload, ctx);
    service.logWithContext(payload, ctx);
    service.logWithContext({ ...payload, resourceId: 'p2' }, ctx);

    expect(db.insertInto).toHaveBeenCalledTimes(2);
  });

  it('never coalesces other events', () => {
    const { service, db } = setup();
    const payload = {
      event: 'page.trashed',
      resourceType: 'page',
      resourceId: 'p1',
    } as any;

    service.logWithContext(payload, ctx);
    service.logWithContext(payload, ctx);

    expect(db.insertInto).toHaveBeenCalledTimes(2);
  });
});
