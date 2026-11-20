import { Kysely, sql } from 'kysely';

// Users already linked to an SSO provider or managed by SCIM lose local
// password login/change/reset (has_generated_password = true is the marker).
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE users SET has_generated_password = true
    WHERE has_generated_password = false
    AND (
      scim_external_id IS NOT NULL
      OR id IN (SELECT user_id FROM auth_accounts)
    )
  `.execute(db);
}

// Not reversible: original per-user values are not recorded.
export async function down(): Promise<void> {}
