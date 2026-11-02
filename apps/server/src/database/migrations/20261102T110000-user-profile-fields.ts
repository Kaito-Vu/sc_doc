import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('job_title', 'varchar', (col) => col)
    .addColumn('department', 'varchar', (col) => col)
    .addColumn('employee_id', 'varchar', (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('job_title')
    .dropColumn('department')
    .dropColumn('employee_id')
    .execute();
}
