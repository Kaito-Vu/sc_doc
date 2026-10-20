import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { sql } from 'kysely';
import { stringify } from 'csv-stringify/sync';
import { AuditQueryFilters } from './dto/audit-query.dto';

const EXPORT_ROW_LIMIT = 20000;

// Aggregates scan every matching row; without a lower bound they would walk the
// whole retention window on each page view.
const DEFAULT_AGGREGATE_WINDOW_DAYS = 30;

function withDefaultWindow(filters: AuditQueryFilters): AuditQueryFilters {
  if (filters?.startDate) return filters;
  const start = new Date(
    Date.now() - DEFAULT_AGGREGATE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return { ...filters, startDate: start.toISOString() };
}

// Spreadsheet apps execute cells starting with these characters as formulas.
function neutralizeFormula(value: unknown): unknown {
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value)
    ? `'${value}`
    : value;
}

const SECURITY_EVENT_SQL = `audit.event in (
  'user.login_failed',
  'user.password_reset',
  'user.password_reset_requested',
  'user.role_changed',
  'user.deleted',
  'user.deactivated',
  'sso.provider_created',
  'sso.provider_updated',
  'sso.provider_deleted',
  'api_key.created',
  'api_key.updated',
  'api_key.deleted',
  'page.restricted',
  'page.restriction_removed',
  'page.permission_removed',
  'license.removed'
)`;

type StatsRow = {
  total?: string | number;
  activeActors?: string | number;
  securityEvents?: string | number;
  failedLogins?: string | number;
  today?: string | number;
};

@Injectable()
export class AuditQueryService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private applyFilters(
    query: any,
    filters: AuditQueryFilters = {},
    search?: string,
  ) {
    let q = query;

    if (filters?.event) {
      q = q.where('audit.event', '=', filters.event);
    } else if (filters?.events?.length) {
      q = q.where('audit.event', 'in', filters.events);
    }

    if (filters?.resourceType) {
      q = q.where('audit.resourceType', '=', filters.resourceType);
    }
    if (filters?.resourceId) {
      q = q.where('audit.resourceId', '=', filters.resourceId);
    }
    if (filters?.actorId) {
      q = q.where('audit.actorId', '=', filters.actorId);
    }
    if (filters?.actorTypes?.length) {
      q = q.where('audit.actorType', 'in', filters.actorTypes);
    }
    if (filters?.spaceId) {
      q = q.where('audit.spaceId', '=', filters.spaceId);
    }
    if (filters?.ipAddress) {
      q = q.where('audit.ipAddress', '=', filters.ipAddress);
    }
    if (filters?.startDate) {
      q = q.where('audit.createdAt', '>=', new Date(filters.startDate));
    }
    if (filters?.endDate) {
      const endDate = new Date(filters.endDate);
      // A date-only bound means the whole day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)) {
        endDate.setUTCHours(23, 59, 59, 999);
      }
      q = q.where('audit.createdAt', '<=', endDate);
    }

    const term = (search ?? filters?.search)?.trim();
    if (term) {
      // Escape LIKE wildcards so user input is matched literally.
      const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      q = q.where(
        sql<boolean>`(
          audit.event ilike ${like}
          or audit.resource_type ilike ${like}
          or audit.resource_id::text ilike ${like}
          or audit.user_agent ilike ${like}
          or exists (
            select 1 from users u
            where u.id = audit.actor_id
              and (u.name ilike ${like} or u.email ilike ${like})
          )
        )`,
      );
    }

    return q;
  }

  /**
   * Uses correlated json subqueries instead of joins so the cursor helper's
   * unqualified `order by id` stays unambiguous and no row is duplicated.
   */
  private buildListQuery(workspaceId: string) {
    return this.db
      .selectFrom('audit')
      .selectAll('audit')
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['id', 'name', 'email', 'avatarUrl'])
            .whereRef('users.id', '=', 'audit.actorId'),
        ).as('actor'),
        jsonObjectFrom(
          eb
            .selectFrom('pages')
            .leftJoin('spaces', 'spaces.id', 'pages.spaceId')
            .select(['pages.id', 'pages.title', 'pages.slugId', 'spaces.slug'])
            .whereRef('pages.id', '=', 'audit.resourceId'),
        ).as('pageResource'),
        jsonObjectFrom(
          eb
            .selectFrom('spaces')
            .select(['id', 'name', 'slug'])
            .whereRef('spaces.id', '=', 'audit.resourceId'),
        ).as('spaceResource'),
        jsonObjectFrom(
          eb
            .selectFrom('spaces')
            .select(['id', 'name', 'slug'])
            .whereRef('spaces.id', '=', 'audit.spaceId'),
        ).as('auditSpace'),
        jsonObjectFrom(
          eb
            .selectFrom('groups')
            .select(['id', 'name'])
            .whereRef('groups.id', '=', 'audit.resourceId'),
        ).as('groupResource'),
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['id', 'name'])
            .whereRef('users.id', '=', 'audit.resourceId'),
        ).as('userResource'),
      ])
      .where('audit.workspaceId', '=', workspaceId);
  }

  private mapRow(row: any) {
    const {
      pageResource,
      spaceResource,
      auditSpace,
      groupResource,
      userResource,
      ...rest
    } = row;

    let resource: Record<string, unknown> | undefined;

    switch (rest.resourceType) {
      case 'page':
        if (pageResource) {
          resource = {
            id: pageResource.id,
            name: pageResource.title || 'Untitled',
            slugId: pageResource.slugId,
            spaceSlug: pageResource.slug,
          };
        }
        break;
      case 'space':
      case 'personal_space':
        if (spaceResource) {
          resource = {
            id: spaceResource.id,
            name: spaceResource.name,
            slug: spaceResource.slug,
          };
        }
        break;
      case 'space_member':
        if (auditSpace) {
          resource = {
            id: auditSpace.id,
            name: auditSpace.name,
            slug: auditSpace.slug,
          };
        }
        break;
      case 'group':
        if (groupResource) {
          resource = { id: groupResource.id, name: groupResource.name };
        }
        break;
      case 'user':
        if (userResource) {
          resource = { id: userResource.id, name: userResource.name };
        }
        break;
      default:
        break;
    }

    return {
      ...rest,
      actorType: rest.actorType ?? 'user',
      actor: rest.actor ?? null,
      resource,
    };
  }

  async queryLogs(
    workspaceId: string,
    pagination: PaginationOptions,
    filters: AuditQueryFilters,
  ) {
    const query = this.applyFilters(
      this.buildListQuery(workspaceId),
      filters,
      filters?.search,
    );

    const result = await (executeWithCursorPagination as any)(query, {
      perPage: pagination.limit ?? 50,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'id', direction: 'desc' }],
      parseCursor: (cursor: any) => ({ id: cursor.id }),
    });

    return {
      ...result,
      items: result.items.map((row: any) => this.mapRow(row)),
    };
  }

  async getDetail(workspaceId: string, id: string) {
    const query = this.buildListQuery(workspaceId).where('audit.id', '=', id);
    const row = await query.executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async getStats(workspaceId: string, rawFilters: AuditQueryFilters) {
    const filters = withDefaultWindow(rawFilters);
    const base = () =>
      this.applyFilters(
        this.db
          .selectFrom('audit')
          .where('audit.workspaceId', '=', workspaceId),
        filters,
        filters?.search,
      );

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [
      summary,
      byEvent,
      byResourceType,
      timeline,
      topActors,
      topIps,
    ] = await Promise.all([
      base()
        .select([
          sql<number>`count(*)`.as('total'),
          sql<number>`count(distinct audit.actor_id)`.as('activeActors'),
          sql<number>`count(*) filter (where ${sql.raw(
            SECURITY_EVENT_SQL,
          )})`.as('securityEvents'),
          sql<number>`count(*) filter (where audit.event = 'user.login_failed')`.as(
            'failedLogins',
          ),
          sql<number>`count(*) filter (where audit.created_at >= ${startOfToday})`.as(
            'today',
          ),
        ])
        .executeTakeFirst(),
      base()
        .select(['audit.event as event', sql<number>`count(*)`.as('count')])
        .groupBy('audit.event')
        .orderBy(sql`count(*)`, 'desc')
        .limit(20)
        .execute(),
      base()
        .select([
          'audit.resourceType as resourceType',
          sql<number>`count(*)`.as('count'),
        ])
        .groupBy('audit.resourceType')
        .orderBy(sql`count(*)`, 'desc')
        .limit(20)
        .execute(),
      base()
        .select([
          sql<string>`to_char(date_trunc('day', audit.created_at), 'YYYY-MM-DD')`.as(
            'date',
          ),
          sql<number>`count(*)`.as('count'),
        ])
        .groupBy(sql`date_trunc('day', audit.created_at)`)
        .orderBy(sql`date_trunc('day', audit.created_at)`, 'desc')
        .limit(366)
        .execute(),
      base()
        .leftJoin('users', 'users.id', 'audit.actorId')
        .where('audit.actorId', 'is not', null)
        .select([
          'audit.actorId as actorId',
          'audit.actorType as actorType',
          'users.name as name',
          'users.email as email',
          sql<number>`count(*)`.as('count'),
        ])
        .groupBy([
          'audit.actorId',
          'audit.actorType',
          'users.name',
          'users.email',
        ])
        .orderBy(sql`count(*)`, 'desc')
        .limit(10)
        .execute(),
      base()
        .select([
          sql<string>`audit.ip_address::text`.as('ipAddress'),
          sql<number>`count(*)`.as('count'),
        ])
        .where('audit.ipAddress', 'is not', null)
        .groupBy(sql`audit.ip_address::text`)
        .orderBy(sql`count(*)`, 'desc')
        .limit(10)
        .execute(),
    ]);

    const stats = (summary ?? {}) as StatsRow;

    return {
      total: Number(stats.total ?? 0),
      today: Number(stats.today ?? 0),
      activeActors: Number(stats.activeActors ?? 0),
      securityEvents: Number(stats.securityEvents ?? 0),
      failedLogins: Number(stats.failedLogins ?? 0),
      byEvent: byEvent.map((row: any) => ({
        event: row.event,
        count: Number(row.count ?? 0),
      })),
      byResourceType: byResourceType.map((row: any) => ({
        resourceType: row.resourceType,
        count: Number(row.count ?? 0),
      })),
      timeline: timeline
        .map((row: any) => ({
          date: row.date,
          count: Number(row.count ?? 0),
        }))
        .reverse(),
      topActors: topActors.map((row: any) => ({
        actorId: row.actorId,
        actorType: row.actorType,
        name: row.name ?? null,
        email: row.email ?? null,
        count: Number(row.count ?? 0),
      })),
      topIps: topIps.map((row: any) => ({
        ipAddress: row.ipAddress,
        count: Number(row.count ?? 0),
      })),
    };
  }

  async getFacets(workspaceId: string, rawFilters: AuditQueryFilters) {
    const filters = withDefaultWindow(rawFilters);
    // The event facet keeps every option visible even while one is selected.
    const facetFilters: AuditQueryFilters = {
      ...filters,
      event: undefined,
      events: undefined,
      search: undefined,
    };

    const base = () =>
      this.applyFilters(
        this.db
          .selectFrom('audit')
          .where('audit.workspaceId', '=', workspaceId),
        facetFilters,
      );

    const [events, resourceTypes, actors, actorTypes, spaces] =
      await Promise.all([
        base()
          .select(['audit.event as event', sql<number>`count(*)`.as('count')])
          .groupBy('audit.event')
          .orderBy('audit.event', 'asc')
          .execute(),
        base()
          .select([
            'audit.resourceType as resourceType',
            sql<number>`count(*)`.as('count'),
          ])
          .groupBy('audit.resourceType')
          .orderBy('audit.resourceType', 'asc')
          .execute(),
        base()
          .leftJoin('users', 'users.id', 'audit.actorId')
          .where('audit.actorId', 'is not', null)
          .select([
            'audit.actorId as actorId',
            'audit.actorType as actorType',
            'users.name as name',
            'users.email as email',
            'users.avatarUrl as avatarUrl',
            sql<number>`count(*)`.as('count'),
          ])
          .groupBy([
            'audit.actorId',
            'audit.actorType',
            'users.name',
            'users.email',
            'users.avatarUrl',
          ])
          .orderBy(sql`count(*)`, 'desc')
          .limit(200)
          .execute(),
        base()
          .select([
            'audit.actorType as actorType',
            sql<number>`count(*)`.as('count'),
          ])
          .groupBy('audit.actorType')
          .execute(),
        base()
          .leftJoin('spaces', 'spaces.id', 'audit.spaceId')
          .where('audit.spaceId', 'is not', null)
          .select([
            'audit.spaceId as spaceId',
            'spaces.name as name',
            'spaces.slug as slug',
            sql<number>`count(*)`.as('count'),
          ])
          .groupBy(['audit.spaceId', 'spaces.name', 'spaces.slug'])
          .orderBy(sql`count(*)`, 'desc')
          .limit(200)
          .execute(),
      ]);

    return {
      events: events.map((row: any) => ({
        event: row.event,
        count: Number(row.count ?? 0),
      })),
      resourceTypes: resourceTypes.map((row: any) => ({
        resourceType: row.resourceType,
        count: Number(row.count ?? 0),
      })),
      actors: actors.map((row: any) => ({
        actorId: row.actorId,
        actorType: row.actorType,
        name: row.name ?? null,
        email: row.email ?? null,
        avatarUrl: row.avatarUrl ?? null,
        count: Number(row.count ?? 0),
      })),
      actorTypes: actorTypes.map((row: any) => ({
        actorType: row.actorType,
        count: Number(row.count ?? 0),
      })),
      spaces: spaces.map((row: any) => ({
        spaceId: row.spaceId,
        name: row.name ?? null,
        slug: row.slug ?? null,
        count: Number(row.count ?? 0),
      })),
    };
  }

  async exportCsv(
    workspaceId: string,
    filters: AuditQueryFilters,
  ): Promise<{ csv: string; rowCount: number }> {
    const query = this.applyFilters(
      this.db
        .selectFrom('audit')
        .leftJoin('users as actor', 'actor.id', 'audit.actorId')
        .leftJoin('pages', 'pages.id', 'audit.resourceId')
        .leftJoin(
          'spaces as resourceSpace',
          'resourceSpace.id',
          'audit.resourceId',
        )
        .leftJoin('groups', 'groups.id', 'audit.resourceId')
        .leftJoin(
          'users as resourceUser',
          'resourceUser.id',
          'audit.resourceId',
        )
        .selectAll('audit')
        .select([
          'actor.name as actorName',
          'actor.email as actorEmail',
          sql<
            string | null
          >`coalesce(pages.title, resourceSpace.name, groups.name, resourceUser.name)`.as(
            'resourceName',
          ),
        ])
        .where('audit.workspaceId', '=', workspaceId),
      filters,
      filters?.search,
    )
      .orderBy('audit.id', 'desc')
      .limit(EXPORT_ROW_LIMIT);

    const rows = await query.execute();

    const records = rows.map((row: any) => ({
      id: row.id,
      timestamp: new Date(row.createdAt).toISOString(),
      event: row.event,
      actorType: row.actorType ?? 'user',
      actorId: row.actorId ?? '',
      actorName: row.actorName ?? '',
      actorEmail: row.actorEmail ?? '',
      resourceType: row.resourceType,
      resourceId: row.resourceId ?? '',
      resourceName: row.resourceName ?? '',
      spaceId: row.spaceId ?? '',
      ipAddress: row.ipAddress ?? '',
      userAgent: row.userAgent ?? '',
      changes: row.changes ? JSON.stringify(row.changes) : '',
      metadata: row.metadata ? JSON.stringify(row.metadata) : '',
    }));

    return {
      csv: stringify(records, {
        header: true,
        cast: { string: (value) => String(neutralizeFormula(value)) },
      }),
      rowCount: records.length,
    };
  }

  async getRetention(workspaceId: string) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return {
      retentionDays: Number(workspace?.auditRetentionDays ?? 90),
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
