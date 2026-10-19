import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { AuditQueryFilters } from './dto/audit-query.dto';

@Injectable()
export class AuditQueryService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async queryLogs(
    workspaceId: string,
    pagination: PaginationOptions,
    filters: AuditQueryFilters,
  ) {
    let query = this.db
      .selectFrom('audit')
      .selectAll('audit')
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['id', 'name', 'email', 'avatarUrl'])
            .whereRef('users.id', '=', 'audit.actorId'),
        ).as('actor'),
      )
      .where('workspaceId', '=', workspaceId);

    if (filters?.event) {
      query = query.where('event', '=', filters.event);
    }
    if (filters?.resourceType) {
      query = query.where('resourceType', '=', filters.resourceType);
    }
    if (filters?.actorId) {
      query = query.where('actorId', '=', filters.actorId);
    }
    if (filters?.spaceId) {
      query = query.where('spaceId', '=', filters.spaceId);
    }
    if (filters?.startDate) {
      query = query.where('createdAt', '>=', new Date(filters.startDate));
    }
    if (filters?.endDate) {
      query = query.where('createdAt', '<=', new Date(filters.endDate));
    }

    // Keyset on the uuid v7 id only: it is time-ordered, matches the
    // (workspace_id, id desc) index, and avoids createdAt's µs precision being
    // truncated to ms in the cursor (which skipped rows at page boundaries).
    // Ordering comes from `fields`; a pre-applied orderBy breaks beforeCursor.
    return executeWithCursorPagination(query, {
      perPage: pagination.limit ?? 50,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'id', direction: 'desc' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async getRetention(workspaceId: string) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return {
      retentionDays: workspace?.auditRetentionDays ?? 90,
    };
  }

  async updateRetention(workspaceId: string, auditRetentionDays: number) {
    await this.db
      .updateTable('workspaces')
      .set({ auditRetentionDays, updatedAt: new Date() })
      .where('id', '=', workspaceId)
      .execute();

    return { retentionDays: auditRetentionDays };
  }
}
