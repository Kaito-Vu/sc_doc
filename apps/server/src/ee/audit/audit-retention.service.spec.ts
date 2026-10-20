import { PostgresQueryCompiler } from 'kysely';
import { AuditRetentionService } from './audit-retention.service';

function makeDb(locked: boolean, auditRows: { id: string }[]) {
  const executed: string[] = [];
  const conn = {
    executeQuery: jest.fn(async (q: any) => {
      const text: string = q.sql;
      executed.push(text);
      return { rows: text.includes('try_advisory') ? [{ locked }] : [] };
    }),
  };
  const deleteExec = jest.fn().mockResolvedValue(undefined);
  const selectExec = jest
    .fn()
    .mockResolvedValueOnce([{ id: 'w1', auditRetentionDays: 90 }])
    .mockResolvedValueOnce(auditRows)
    .mockResolvedValue([]);
  const chain: any = new Proxy(
    {},
    { get: (_t, p) => (p === 'execute' ? selectExec : () => chain) },
  );
  const del: any = new Proxy(
    {},
    { get: (_t, p) => (p === 'execute' ? deleteExec : () => del) },
  );
  const db: any = {
    connection: () => ({
      execute: (fn: any) =>
        fn({
          getExecutor: () => ({
            transformQuery: (n: any) => n,
            compileQuery: (n: any, id: any) =>
              new PostgresQueryCompiler().compileQuery(n, id),
            executeQuery: conn.executeQuery,
            withConnectionProvider: () => ({}),
          }),
        }),
    }),
    selectFrom: () => chain,
    deleteFrom: () => del,
  };
  return { db, executed, deleteExec, conn };
}

describe('AuditRetentionService', () => {
  it('does nothing when lock not acquired', async () => {
    const { db, executed, deleteExec } = makeDb(false, [{ id: 'a' }]);
    const audit = { logWithContext: jest.fn() };
    await new AuditRetentionService(db, audit as any).purgeExpiredLogs();
    expect(deleteExec).not.toHaveBeenCalled();
    expect(audit.logWithContext).not.toHaveBeenCalled();
    expect(executed.some((q) => q.includes('advisory_unlock'))).toBe(false);
  });

  it('purges, unlocks and audits when lock acquired', async () => {
    const { db, executed, deleteExec } = makeDb(true, [{ id: 'a' }]);
    const audit = { logWithContext: jest.fn() };
    await new AuditRetentionService(db, audit as any).purgeExpiredLogs();
    expect(deleteExec).toHaveBeenCalledTimes(1);
    expect(executed.some((q) => q.includes('advisory_unlock'))).toBe(true);
    expect(audit.logWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit.purged',
        resourceId: 'w1',
        metadata: expect.objectContaining({ deletedCount: 1, retentionDays: 90 }),
      }),
      { workspaceId: 'w1', actorType: 'system' },
    );
  });
});
