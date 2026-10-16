import { Kysely } from 'kysely';

// pages.is_locked already exists; add who locked it and when.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('locked_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('locked_at', 'timestamptz')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .dropColumn('locked_by_id')
    .dropColumn('locked_at')
    .execute();
}
