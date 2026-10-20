import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex('idx_audit_workspace_created_at')
    .ifNotExists()
    .on('audit')
    .columns(['workspace_id', 'created_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_audit_workspace_event')
    .ifNotExists()
    .on('audit')
    .columns(['workspace_id', 'event'])
    .execute();

  await db.schema
    .createIndex('idx_audit_workspace_actor')
    .ifNotExists()
    .on('audit')
    .columns(['workspace_id', 'actor_id'])
    .execute();

  await db.schema
    .createIndex('idx_audit_workspace_resource')
    .ifNotExists()
    .on('audit')
    .columns(['workspace_id', 'resource_type', 'resource_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_audit_workspace_created_at')
    .ifExists()
    .execute();
  await db.schema.dropIndex('idx_audit_workspace_event').ifExists().execute();
  await db.schema.dropIndex('idx_audit_workspace_actor').ifExists().execute();
  await db.schema
    .dropIndex('idx_audit_workspace_resource')
    .ifExists()
    .execute();
}
