import { WorkspaceSettingsRepo } from './workspace-settings.repo';
import { captureKysely } from './test-kysely';

describe('WorkspaceSettingsRepo', () => {
  it('mergeSettings: scoped by workspace id, returns settings', async () => {
    const { db, queries } = captureKysely([[{ settings: { a: 1 } }]]);
    const out = await new WorkspaceSettingsRepo(db).mergeSettings('w1', {
      a: 1,
    });
    expect(out).toEqual({ a: 1 });
    expect(queries[0].sql).toBe(
      `update "workspaces" set "settings" = COALESCE(settings, '{}'::jsonb) || $1::text::jsonb, "updated_at" = $2 where "id" = $3 returning "settings"`,
    );
    expect(queries[0].parameters[0]).toBe('{"a":1}');
    expect(queries[0].parameters[2]).toBe('w1');
  });

  it('mergeSettings: undefined when no row', async () => {
    const { db } = captureKysely([[]]);
    expect(await new WorkspaceSettingsRepo(db).mergeSettings('w', {})).toBe(
      undefined,
    );
  });

  it('setUserSetting: user row scoped by workspace_id', async () => {
    const { db, queries } = captureKysely();
    await new WorkspaceSettingsRepo(db).setUserSetting('w1', 'u1', 'k', 5);
    expect(queries[0].sql).toBe(
      `UPDATE "users" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY[$1::text], to_jsonb($2::bigint)) WHERE id = $3 AND workspace_id = $4`,
    );
    expect(queries[0].parameters).toEqual(['k', 5, 'u1', 'w1']);
  });

  it('setUserSetting: workspace row when userId null', async () => {
    const { db, queries } = captureKysely();
    await new WorkspaceSettingsRepo(db).setUserSetting('w1', null, 'k', 5);
    expect(queries[0].sql).toContain('UPDATE "workspaces" SET');
    expect(queries[0].sql).toMatch(/WHERE id = \$3$/);
    expect(queries[0].parameters).toEqual(['k', 5, 'w1']);
  });

  it('clearUserSetting: user / workspace', async () => {
    const { db, queries } = captureKysely();
    const repo = new WorkspaceSettingsRepo(db);
    await repo.clearUserSetting('w1', 'u1', 'k');
    await repo.clearUserSetting('w1', null, 'k');
    expect(queries[0].sql).toBe(
      `UPDATE "users" SET settings = settings - $1::text WHERE id = $2 AND workspace_id = $3`,
    );
    expect(queries[0].parameters).toEqual(['k', 'u1', 'w1']);
    expect(queries[1].sql).toBe(
      `UPDATE "workspaces" SET settings = settings - $1::text WHERE id = $2`,
    );
    expect(queries[1].parameters).toEqual(['k', 'w1']);
  });
});
