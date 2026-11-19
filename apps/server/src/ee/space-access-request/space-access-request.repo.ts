import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { sql } from 'kysely';
import { activeWorkspaceUsers } from '../common/active-user';

export type SpaceAccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

// 'all' = workspace-wide (owner/admin); otherwise the space ids the caller administers.
export type SpaceScope = string[] | 'all';

@Injectable()
export class SpaceAccessRequestRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(data: {
    workspaceId: string;
    spaceId: string;
    requesterId: string;
    roleRequested: string;
    message?: string | null;
  }) {
    return this.db
      .insertInto('spaceAccessRequests')
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId,
        requesterId: data.requesterId,
        roleRequested: data.roleRequested,
        message: data.message ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findPendingForSpaceAndUser(spaceId: string, userId: string) {
    return this.db
      .selectFrom('spaceAccessRequests')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('requesterId', '=', userId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
  }

  async findLatestForSpaceAndUser(spaceId: string, userId: string) {
    return this.db
      .selectFrom('spaceAccessRequests')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('requesterId', '=', userId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
  }

  async findByIdForUpdate(id: string, trx: KyselyTransaction) {
    return trx
      .selectFrom('spaceAccessRequests')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  async decide(
    id: string,
    trx: KyselyTransaction,
    patch: {
      status: Exclude<SpaceAccessRequestStatus, 'pending'>;
      reviewerId?: string;
      roleGranted?: string;
      decisionReason?: string;
    },
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('spaceAccessRequests')
      .set({
        status: patch.status,
        reviewerId: patch.reviewerId ?? null,
        roleGranted: patch.roleGranted ?? null,
        decisionReason: patch.decisionReason ?? null,
        decidedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  private scoped(workspaceId: string, spaces: SpaceScope) {
    let qb = this.db
      .selectFrom('spaceAccessRequests')
      .where('spaceAccessRequests.workspaceId', '=', workspaceId)
      .where('spaceAccessRequests.status', '=', 'pending');
    if (spaces !== 'all') {
      // an empty list must match nothing, never produce `IN ()`
      qb = qb.where(
        'spaceAccessRequests.spaceId',
        'in',
        spaces.length ? spaces : [sql<string>`NULL`],
      );
    }
    return qb;
  }

  async listPending(
    workspaceId: string,
    spaces: SpaceScope,
    pagination: PaginationOptions,
  ) {
    const query = this.scoped(workspaceId, spaces)
      .innerJoin('users', 'users.id', 'spaceAccessRequests.requesterId')
      .innerJoin('spaces', 'spaces.id', 'spaceAccessRequests.spaceId')
      .select([
        'spaceAccessRequests.id',
        'spaceAccessRequests.spaceId',
        'spaceAccessRequests.roleRequested',
        'spaceAccessRequests.message',
        'spaceAccessRequests.createdAt',
        'users.id as requesterId',
        'users.name as requesterName',
        'users.avatarUrl as requesterAvatarUrl',
        'spaces.name as spaceName',
        'spaces.slug as spaceSlug',
      ]);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'spaceAccessRequests.createdAt', direction: 'desc', key: 'createdAt' },
        { expression: 'spaceAccessRequests.id', direction: 'desc', key: 'id' },
      ],
      parseCursor: (cursor) => ({
        createdAt: new Date(cursor.createdAt),
        id: cursor.id,
      }),
    });
  }

  async countPending(workspaceId: string, spaces: SpaceScope): Promise<number> {
    const row = await this.scoped(workspaceId, spaces)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  // Space ids where the user is Full access (direct membership or via group).
  async findAdminSpaceIds(userId: string, workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('spaceMembers')
      .innerJoin('spaces', 'spaces.id', 'spaceMembers.spaceId')
      .select('spaceMembers.spaceId')
      .where('spaces.workspaceId', '=', workspaceId)
      .where('spaceMembers.role', '=', 'admin')
      .where('spaceMembers.userId', '=', userId)
      .unionAll(
        this.db
          .selectFrom('spaceMembers')
          .innerJoin('spaces', 'spaces.id', 'spaceMembers.spaceId')
          .innerJoin('groupUsers', 'groupUsers.groupId', 'spaceMembers.groupId')
          .select('spaceMembers.spaceId')
          .where('spaces.workspaceId', '=', workspaceId)
          .where('spaceMembers.role', '=', 'admin')
          .where('groupUsers.userId', '=', userId),
      )
      .execute();
    return [...new Set(rows.map((r) => r.spaceId))];
  }

  // Active workspace owners/admins + Full access members of the space.
  async findApproverIds(workspaceId: string, spaceId: string): Promise<string[]> {
    const wsAdmins = await activeWorkspaceUsers(this.db, workspaceId)
      .select('users.id')
      .where('users.role', 'in', ['owner', 'admin'])
      .execute();
    const direct = await this.db
      .selectFrom('spaceMembers')
      .select('userId')
      .where('spaceId', '=', spaceId)
      .where('role', '=', 'admin')
      .where('userId', 'is not', null)
      .unionAll(
        this.db
          .selectFrom('spaceMembers')
          .innerJoin('groupUsers', 'groupUsers.groupId', 'spaceMembers.groupId')
          .select('groupUsers.userId')
          .where('spaceMembers.spaceId', '=', spaceId)
          .where('spaceMembers.role', '=', 'admin'),
      )
      .execute();
    const ids = new Set<string>(wsAdmins.map((u) => u.id));
    for (const r of direct) if (r.userId) ids.add(r.userId);
    return [...ids];
  }
}
