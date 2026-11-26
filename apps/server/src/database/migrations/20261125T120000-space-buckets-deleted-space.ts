import { type Kysely, sql } from 'kysely';

// space_bucket_name(): a key can still point at a space that no longer exists
// (file kept for another page after its space was deleted). Such keys get a
// bucket "space-{spaceId}" instead of failing.
export async function up(db: Kysely<any>): Promise<void> {
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
        v_base := 'space-' || p_space_id::text;
      END IF;
      IF length(v_base) < 3 THEN v_base := v_base || '-sp'; END IF;

      LOOP
        v_try := CASE WHEN n = 1 THEN v_base ELSE v_base || '-' || n END;
        IF NOT (v_try = ANY (p_reserved)) THEN
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

export async function down(): Promise<void> {
  // keeps the fallback; the previous version only raised an error instead
}
