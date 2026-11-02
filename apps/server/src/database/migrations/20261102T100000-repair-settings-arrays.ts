import { Kysely, sql } from 'kysely';

// A `${JSON.stringify(x)}::jsonb` bind was double-encoded by the driver, so
// `settings || <jsonb string>` appended to the column and turned it into an
// array. Fold such arrays back into one object (later entries win).
async function repair(db: Kysely<any>, table: 'workspaces' | 'users') {
  await sql`
    UPDATE ${sql.table(table)} t
    SET settings = (
      SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
      FROM (
        SELECT DISTINCT ON (kv.key) kv.key AS k, kv.value AS v
        FROM jsonb_array_elements(t.settings) WITH ORDINALITY AS e(el, n),
        LATERAL (
          SELECT CASE WHEN jsonb_typeof(e.el) = 'string'
                      THEN (e.el #>> '{}')::jsonb ELSE e.el END AS obj
        ) o,
        LATERAL jsonb_each(o.obj) AS kv
        WHERE jsonb_typeof(o.obj) = 'object'
        ORDER BY kv.key, e.n DESC
      ) s
    )
    WHERE jsonb_typeof(t.settings) = 'array'
  `.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await repair(db, 'workspaces');
  await repair(db, 'users');
}

// Data repair is not reversible.
export async function down(_db: Kysely<any>): Promise<void> {}
