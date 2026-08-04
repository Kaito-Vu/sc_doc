import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('auth_providers')
    .addColumn('oidc_tenant_id', 'varchar')
    .execute();

  await db.schema
    .alterTable('audit')
    .addColumn('user_agent', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('audit')
    .dropColumn('user_agent')
    .execute();

  await db.schema
    .alterTable('auth_providers')
    .dropColumn('oidc_tenant_id')
    .execute();
}
