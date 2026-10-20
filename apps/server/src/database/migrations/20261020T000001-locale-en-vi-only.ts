import { Kysely, sql } from 'kysely';

// The product now supports only en-US and vi-VN. Normalize legacy user and
// workspace language values so no removed locale can be loaded or re-saved.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE users
    SET locale = 'en-US'
    WHERE locale IS NULL
       OR locale = ''
       OR locale NOT IN ('en-US', 'vi-VN')
  `.execute(db);

  await sql`
    UPDATE workspaces
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{defaultLocale}',
      '"en-US"'::jsonb
    )
    WHERE settings ? 'defaultLocale'
      AND settings->>'defaultLocale' NOT IN ('en-US', 'vi-VN')
  `.execute(db);
}

// Data normalization is not reversible.
export async function down(_db: Kysely<any>): Promise<void> {}
