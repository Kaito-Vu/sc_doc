import {
  CamelCasePlugin,
  CompiledQuery,
  DatabaseConnection,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

// Test helper: a real Kysely that never touches a DB. Records compiled
// queries; `rows` is a queue of results, one per executed query.
export function captureKysely(rows: any[][] = []) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const conn: DatabaseConnection = {
    async executeQuery(q: CompiledQuery) {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: rows.shift() ?? [] } as any;
    },
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('not supported');
    },
  };
  const db = new Kysely<any>({
    plugins: [new CamelCasePlugin()],
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => ({
        init: async () => {},
        acquireConnection: async () => conn,
        beginTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        releaseConnection: async () => {},
        destroy: async () => {},
      }),
      createIntrospector: (d) => new PostgresIntrospector(d),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db: db as any, queries };
}
