import { type Kysely, sql } from 'kysely';

// Bucket-per-space (ee/storage-buckets): each space's bucket is named after
// its slug ONCE and then never changes (a slug rename keeps the bucket).
// No FK on space_id: rows outlive deleted spaces so a new space with the same
// slug never reuses an old bucket.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_buckets')
    .addColumn('space_id', 'uuid', (col) => col.primaryKey())
    .addColumn('bucket', 'varchar(63)', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Returns the space's bucket, assigning one on first call. Single source of
  // truth for the app and the migration script. S3 rules: 3-63 chars of
  // [a-z0-9-], starting/ending alphanumeric. Collisions (e.g. "a_b" vs "a-b",
  // or a reserved name like the system bucket) get "-2", "-3", ...
  await sql`
    CREATE OR REPLACE FUNCTION space_bucket_name(p_space_id uuid, p_reserved text[] DEFAULT '{}')
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE
      v_bucket text;
      v_base text;
      v_try text;
      n int := 1;
    BEGIN
      SELECT bucket INTO v_bucket FROM space_buckets WHERE space_id = p_space_id;
      IF FOUND THEN RETURN v_bucket; END IF;

      SELECT trim(both '-' from left(replace(lower(slug), '_', '-'), 58))
        INTO v_base FROM spaces WHERE id = p_space_id;
      IF v_base IS NULL THEN
        RAISE EXCEPTION 'space % not found', p_space_id;
      END IF;
      IF length(v_base) < 3 THEN v_base := v_base || '-sp'; END IF;

      LOOP
        v_try := CASE WHEN n = 1 THEN v_base ELSE v_base || '-' || n END;
        IF NOT (v_try = ANY (p_reserved)) THEN
          -- conflicts on space_id (concurrent caller) or bucket (taken)
          INSERT INTO space_buckets (space_id, bucket) VALUES (p_space_id, v_try)
            ON CONFLICT DO NOTHING;
          SELECT bucket INTO v_bucket FROM space_buckets WHERE space_id = p_space_id;
          IF FOUND THEN RETURN v_bucket; END IF;
        END IF;
        n := n + 1;
      END LOOP;
    END $$
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS space_bucket_name(uuid, text[])`.execute(db);
  await db.schema.dropTable('space_buckets').execute();
}
