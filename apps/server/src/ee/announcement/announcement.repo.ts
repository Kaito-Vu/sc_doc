import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Announcement,
  InsertableAnnouncement,
  UpdatableAnnouncement,
} from '@docmost/db/types/entity.types';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

// tsv is trigger-maintained and never returned
const FIELDS = [
  'id',
  'workspaceId',
  'type',
  'color',
  'content',
  'title',
  'textContent',
  'isDismissible',
  'audience',
  'startsAt',
  'endsAt',
  'archivedAt',
  'creatorId',
  'lastUpdatedById',
  'createdAt',
  'updatedAt',
] as const;

export type AnnouncementRow = Pick<Announcement, (typeof FIELDS)[number]>;

@Injectable()
export class AnnouncementRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AnnouncementRow | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('announcements')
      .select(FIELDS)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  insert(data: InsertableAnnouncement, trx?: KyselyTransaction) {
    return dbOrTx(this.db, trx)
      .insertInto('announcements')
      .values(data)
      .returning(FIELDS)
      .executeTakeFirstOrThrow();
  }

  update(
    id: string,
    workspaceId: string,
    data: UpdatableAnnouncement,
    trx?: KyselyTransaction,
  ) {
    return dbOrTx(this.db, trx)
      .updateTable('announcements')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returning(FIELDS)
      .executeTakeFirstOrThrow();
  }

  async delete(id: string, workspaceId: string) {
    await this.db
      .deleteFrom('announcements')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  /** Visible now, newest start first. `publicOnly` limits to the 'everyone' audience. */
  findVisible(
    workspaceId: string,
    now: Date,
    limit: number,
    publicOnly: boolean,
  ): Promise<AnnouncementRow[]> {
    let q = this.db
      .selectFrom('announcements')
      .select(FIELDS)
      .where('workspaceId', '=', workspaceId)
      .where('archivedAt', 'is', null)
      .where('startsAt', '<=', now)
      .where((eb) => eb.or([eb('endsAt', 'is', null), eb('endsAt', '>', now)]));
    if (publicOnly) q = q.where('audience', '=', 'everyone');
    return q
      .orderBy('startsAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
  }

  /** Non-archived, not-yet-ended announcements whose window overlaps [startsAt, endsAt). */
  findOverlapping(
    workspaceId: string,
    window: { startsAt: Date; endsAt: Date | null },
    now: Date,
    excludeId: string | null,
    trx?: KyselyTransaction,
  ): Promise<AnnouncementRow[]> {
    let q = dbOrTx(this.db, trx)
      .selectFrom('announcements')
      .select(FIELDS)
      .where('workspaceId', '=', workspaceId)
      .where('archivedAt', 'is', null)
      .where((eb) => eb.or([eb('endsAt', 'is', null), eb('endsAt', '>', now)]))
      .where((eb) =>
        eb.or([eb('endsAt', 'is', null), eb('endsAt', '>', window.startsAt)]),
      );
    if (window.endsAt) q = q.where('startsAt', '<', window.endsAt);
    if (excludeId) q = q.where('id', '!=', excludeId);
    return q.orderBy('startsAt', 'asc').orderBy('id', 'asc').execute();
  }

  list(
    workspaceId: string,
    status: 'active' | 'archived' | 'all',
    now: Date,
    pagination: PaginationOptions,
  ) {
    let q = this.db
      .selectFrom('announcements')
      .select(FIELDS)
      .where('workspaceId', '=', workspaceId);

    // 'archived' also covers announcements whose end time has passed
    if (status === 'active') {
      q = q
        .where('archivedAt', 'is', null)
        .where((eb) =>
          eb.or([eb('endsAt', 'is', null), eb('endsAt', '>', now)]),
        );
    } else if (status === 'archived') {
      q = q.where((eb) =>
        eb.or([eb('archivedAt', 'is not', null), eb('endsAt', '<=', now)]),
      );
    }

    const search = pagination.query?.trim();
    if (search) {
      q = q.where((eb) =>
        eb.or([
          eb(
            sql`tsv`,
            '@@',
            sql`plainto_tsquery('english', f_unaccent(${search}))`,
          ),
          eb(sql`title`, 'ilike', sql`f_unaccent(${'%' + search + '%'})`),
        ]),
      );
    }

    return executeWithCursorPagination(q, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'startsAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        startsAt: new Date(cursor.startsAt),
        id: cursor.id,
      }),
    });
  }
}
