import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import * as bytes from 'bytes';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export const PERSONAL_SPACE_QUOTA = 'PERSONAL_SPACE_QUOTA';
const DEFAULT_LIMIT = bytes('500mb');

// Quota resolution: user override (users.settings.personalQuotaBytes)
// -> workspace default (workspaces.settings.personalQuotaBytes) -> 500mb.
// Both are edited at /settings/quota.
@Injectable()
export class PersonalSpaceQuotaService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async getWorkspaceDefault(workspaceId: string): Promise<number> {
    const ws = await this.db
      .selectFrom('workspaces')
      .select('settings')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    const v = (ws?.settings as any)?.personalQuotaBytes;
    return typeof v === 'number' ? v : DEFAULT_LIMIT;
  }

  async getLimit(userId: string, workspaceId: string): Promise<number> {
    const user = await this.db
      .selectFrom('users')
      .select('settings')
      .where('id', '=', userId)
      .executeTakeFirst();
    const v = (user?.settings as any)?.personalQuotaBytes;
    return typeof v === 'number' ? v : this.getWorkspaceDefault(workspaceId);
  }

  // limitBytes null clears the override (user) / resets to the 500mb default (workspace)
  async setLimit(
    workspaceId: string,
    userId: string | null,
    limitBytes: number | null,
  ) {
    const table = sql.table(userId ? 'users' : 'workspaces');
    const where = userId
      ? sql`id = ${userId} AND workspace_id = ${workspaceId}`
      : sql`id = ${workspaceId}`;
    const patch =
      limitBytes === null
        ? sql`settings - 'personalQuotaBytes'`
        : sql`jsonb_set(coalesce(settings, '{}'::jsonb), '{personalQuotaBytes}', to_jsonb(${limitBytes}::bigint))`;
    await sql`UPDATE ${table} SET settings = ${patch} WHERE ${where}`.execute(
      this.db,
    );
  }

  async getUsage(spaceId: string, userId: string, workspaceId: string) {
    const row = await this.db
      .selectFrom('attachments')
      .select((eb) => eb.fn.sum('fileSize').as('total'))
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return {
      used: Number(row?.total ?? 0),
      limit: await this.getLimit(userId, workspaceId),
    };
  }

  // Admin view: every personal space with its usage and effective/override limit.
  async listAll(workspaceId: string) {
    const rows = await sql<{
      userId: string;
      name: string;
      email: string;
      used: string;
      override: string | null;
    }>`
      SELECT u.id AS "userId", u.name, u.email,
             COALESCE((SELECT SUM(a.file_size) FROM attachments a
                       WHERE a.space_id = s.id AND a.deleted_at IS NULL), 0) AS used,
             u.settings->>'personalQuotaBytes' AS override
      FROM spaces s JOIN users u ON u.id = s.creator_id
      WHERE s.workspace_id = ${workspaceId} AND s.is_personal AND s.deleted_at IS NULL
      ORDER BY u.name`.execute(this.db);
    const def = await this.getWorkspaceDefault(workspaceId);
    return {
      defaultLimit: def,
      users: rows.rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        used: Number(r.used),
        override: r.override === null ? null : Number(r.override),
        limit: r.override === null ? def : Number(r.override),
      })),
    };
  }

  // No-op for non-personal spaces.
  // ponytail: pre-upload check uses content-length; concurrent uploads can overshoot slightly.
  async assertCanUpload(spaceId: string, incomingBytes = 0): Promise<void> {
    const space = await this.db
      .selectFrom('spaces')
      .select(['isPersonal', 'creatorId', 'workspaceId'])
      .where('id', '=', spaceId)
      .executeTakeFirst();
    if (!space?.isPersonal) return;
    const { used, limit } = await this.getUsage(
      spaceId,
      space.creatorId,
      space.workspaceId,
    );
    if (used + incomingBytes > limit) {
      throw new PayloadTooLargeException(
        `Personal space storage limit exceeded (${bytes(limit)})`,
      );
    }
  }
}
