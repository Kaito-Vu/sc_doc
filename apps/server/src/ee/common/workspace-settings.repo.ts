import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

// ee-local settings (jsonb) writers for workspaces / users. Not @Global:
// register in the owning ee module's providers.
@Injectable()
export class WorkspaceSettingsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  // Shallow-merges `patch` into workspaces.settings; returns the new settings.
  async mergeSettings(workspaceId: string, patch: Record<string, unknown>) {
    const row = await this.db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning('settings')
      .executeTakeFirst();
    return row?.settings;
  }

  // userId set -> users row (scoped by workspace_id); null -> the workspace row.
  async setUserSetting(
    workspaceId: string,
    userId: string | null,
    key: string,
    bigintValue: number,
  ) {
    await this.run(
      workspaceId,
      userId,
      sql`jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY[${key}::text], to_jsonb(${bigintValue}::bigint))`,
    );
  }

  async clearUserSetting(
    workspaceId: string,
    userId: string | null,
    key: string,
  ) {
    await this.run(workspaceId, userId, sql`settings - ${key}::text`);
  }

  private async run(
    workspaceId: string,
    userId: string | null,
    patch: ReturnType<typeof sql>,
  ) {
    // table name comes from a fixed ternary, never from input
    const table = sql.table(userId ? 'users' : 'workspaces');
    const where = userId
      ? sql`id = ${userId} AND workspace_id = ${workspaceId}`
      : sql`id = ${workspaceId}`;
    await sql`UPDATE ${table} SET settings = ${patch} WHERE ${where}`.execute(
      this.db,
    );
  }
}
