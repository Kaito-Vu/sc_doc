import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Azure AD user groups tracking
  await db.schema
    .createTable('azure_ad_user_groups')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('group_id', 'text', (col) => col.notNull())
    .addColumn('group_name', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('unique_user_group_per_workspace', [
      'user_id',
      'workspace_id',
      'group_id',
    ])
    .execute()

  // Create indexes
  await db.schema
    .createIndex('idx_azure_ad_user_groups_user_workspace')
    .on('azure_ad_user_groups')
    .columns(['user_id', 'workspace_id'])
    .execute()

  await db.schema
    .createIndex('idx_azure_ad_user_groups_workspace_group')
    .on('azure_ad_user_groups')
    .columns(['workspace_id', 'group_id'])
    .execute()

  await db.schema
    .createIndex('idx_azure_ad_user_groups_created_at')
    .on('azure_ad_user_groups')
    .column('created_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('azure_ad_user_groups').execute()
}
