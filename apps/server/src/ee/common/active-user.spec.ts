import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { activeWorkspaceUsers } from './active-user';

describe('activeWorkspaceUsers', () => {
  it('excludes deleted and deactivated users and scopes to the workspace', () => {
    const db = new Kysely<any>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (d) => new PostgresIntrospector(d),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
    const { sql, parameters } = activeWorkspaceUsers(db, 'w1')
      .select('users.id')
      .compile();
    expect(sql).toContain('"users"."workspaceId" = $1');
    expect(sql).toContain('"users"."deletedAt" is null');
    expect(sql).toContain('"users"."deactivatedAt" is null');
    expect(parameters).toEqual(['w1']);
  });
});
