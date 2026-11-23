import { PersonalSpaceQuotaService } from './personal-space-quota.service';
import { WorkspaceSettingsRepo } from '../common/workspace-settings.repo';
import { captureKysely } from '../common/test-kysely';

const DEFAULT = 500 * 1024 * 1024;
const make = (rows: any[][] = []) => {
  const { db, queries } = captureKysely(rows);
  return {
    queries,
    svc: new PersonalSpaceQuotaService(db, new WorkspaceSettingsRepo(db)),
  };
};
const settings = (v: unknown) => [[{ settings: { personalQuotaBytes: v } }]];

describe('PersonalSpaceQuotaService', () => {
  it('getWorkspaceDefault: by workspace id; number or 500mb', async () => {
    const { svc, queries } = make(settings(42));
    expect(await svc.getWorkspaceDefault('w1')).toBe(42);
    expect(queries[0].sql).toBe(
      'select "settings" from "workspaces" where "id" = $1',
    );
    expect(queries[0].parameters[0]).toBe('w1');
    expect(await make([[]]).svc.getWorkspaceDefault('w1')).toBe(DEFAULT);
    expect(await make(settings('9')).svc.getWorkspaceDefault('w1')).toBe(
      DEFAULT,
    );
  });

  it('getLimit: user override, else workspace default', async () => {
    const a = make(settings(7));
    expect(await a.svc.getLimit('u1', 'w1')).toBe(7);
    expect(a.queries[0].sql).toBe(
      'select "settings" from "users" where "id" = $1',
    );
    const b = make([[{ settings: {} }], ...settings(11)]);
    expect(await b.svc.getLimit('u1', 'w1')).toBe(11);
    expect(b.queries[1].sql).toContain('from "workspaces"');
    expect(b.queries[1].parameters[0]).toBe('w1');
  });

  it('setLimit: user override scoped by workspace', async () => {
    const { svc, queries } = make();
    await svc.setLimit('w1', 'u1', 100);
    expect(queries[0].sql).toBe(
      `UPDATE "users" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY[$1::text], to_jsonb($2::bigint)) WHERE id = $3 AND workspace_id = $4`,
    );
    expect(queries[0].parameters).toEqual([
      'personalQuotaBytes',
      100,
      'u1',
      'w1',
    ]);
  });

  it('setLimit: workspace default; null clears', async () => {
    const { svc, queries } = make();
    await svc.setLimit('w1', null, 100);
    await svc.setLimit('w1', null, null);
    await svc.setLimit('w1', 'u1', null);
    expect(queries[0].sql).toContain('UPDATE "workspaces"');
    expect(queries[0].sql).toMatch(/WHERE id = \$3$/);
    expect(queries[0].parameters).toEqual(['personalQuotaBytes', 100, 'w1']);
    expect(queries[1].sql).toBe(
      'UPDATE "workspaces" SET settings = settings - $1::text WHERE id = $2',
    );
    expect(queries[1].parameters).toEqual(['personalQuotaBytes', 'w1']);
    expect(queries[2].sql).toBe(
      'UPDATE "users" SET settings = settings - $1::text WHERE id = $2 AND workspace_id = $3',
    );
    expect(queries[2].parameters).toEqual(['personalQuotaBytes', 'u1', 'w1']);
  });
});
