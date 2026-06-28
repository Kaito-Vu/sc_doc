import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Create recaptcha_verifications table
  await db.schema
    .createTable('recaptcha_verifications')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('token', 'text', (col) => col.notNull())
    .addColumn('score', 'numeric', (col) => col.notNull())
    .addColumn('action', 'varchar(50)', (col) => col.notNull())
    .addColumn('decision', 'varchar(20)', (col) => col.notNull())
    .addColumn('decision_reason', 'text')
    .addColumn('user_id', 'uuid')
    .addColumn('ip_address', 'varchar(45)')
    .addColumn('user_agent', 'text')
    .addColumn('challenge_ts', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('fk_recaptcha_workspace', ['workspace_id'], 'workspaces', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_recaptcha_user', ['user_id'], 'users', ['id'], (cb) =>
      cb.onDelete('set null')
    )
    .execute()

  // Create indexes
  await db.schema
    .createIndex('idx_recaptcha_workspace')
    .on('recaptcha_verifications')
    .column('workspace_id')
    .execute()

  await db.schema
    .createIndex('idx_recaptcha_action')
    .on('recaptcha_verifications')
    .column('action')
    .execute()

  await db.schema
    .createIndex('idx_recaptcha_decision')
    .on('recaptcha_verifications')
    .column('decision')
    .execute()

  await db.schema
    .createIndex('idx_recaptcha_created')
    .on('recaptcha_verifications')
    .column('created_at')
    .execute()

  await db.schema
    .createIndex('idx_recaptcha_workspace_created')
    .on('recaptcha_verifications')
    .columns(['workspace_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('idx_recaptcha_user')
    .on('recaptcha_verifications')
    .columns(['user_id', 'workspace_id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop table (cascade will handle related foreign keys)
  await db.schema.dropTable('recaptcha_verifications').ifExists().execute()
}
