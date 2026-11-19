import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_access_requests')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('requester_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('role_requested', 'varchar', (col) => col.notNull())
    .addColumn('message', 'text')
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('pending'))
    .addColumn('reviewer_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('role_granted', 'varchar')
    .addColumn('decision_reason', 'text')
    .addColumn('decided_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX ux_sar_pending
    ON space_access_requests (space_id, requester_id)
    WHERE status = 'pending'
  `.execute(db);

  await db.schema
    .createIndex('idx_sar_workspace_status')
    .on('space_access_requests')
    .columns(['workspace_id', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('space_access_requests').ifExists().execute();
}
