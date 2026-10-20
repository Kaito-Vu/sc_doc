import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_notifications_page_type_created')
    .on('notifications')
    .columns(['user_id', 'page_id', 'type', 'created_at desc'])
    .where(sql.ref('page_id'), 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_notifications_page_type_created')
    .execute();
}
