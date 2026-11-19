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

  async findById(id: string) {
    return this.db
      .selectFrom('spaceAccessRequests')
      .selectAll()
      .where('id', '=', id)
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

  // Pending requests for live spaces from active requesters. 'all' (workspace
  // admins) excludes personal spaces, which admins must not reach implicitly.
  private scoped(workspaceId: string, spaces: SpaceScope) {
    let qb = this.db
      .selectFrom('spaceAccessRequests')
      .innerJoin('users', 'users.id', 'spaceAccessRequests.requesterId')
      .innerJoin('spaces', 'spaces.id', 'spaceAccessRequests.spaceId')
      .where('spaceAccessRequests.workspaceId', '=', workspaceId)
      .where('spaceAccessRequests.status', '=', 'pending')
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where('spaces.deletedAt', 'is', null);
    if (spaces === 'all') {
      qb = qb.where('spaces.isPersonal', '=', false);
    } else {
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
    const query = this.scoped(workspaceId, spaces).select([
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
      .where('spaces.deletedAt', 'is', null)
      .where('spaceMembers.role', '=', 'admin')
      .where('spaceMembers.userId', '=', userId)
      .unionAll(
        this.db
          .selectFrom('spaceMembers')
          .innerJoin('spaces', 'spaces.id', 'spaceMembers.spaceId')
          .innerJoin('groupUsers', 'groupUsers.groupId', 'spaceMembers.groupId')
          .select('spaceMembers.spaceId')
          .where('spaces.workspaceId', '=', workspaceId)
          .where('spaces.deletedAt', 'is', null)
          .where('spaceMembers.role', '=', 'admin')
          .where('groupUsers.userId', '=', userId),
      )
      .execute();
    return [...new Set(rows.map((r) => r.spaceId))];
  }

  async isActiveUser(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const row = await activeWorkspaceUsers(dbOrTx(this.db, trx), workspaceId)
      .select('users.id')
      .where('users.id', '=', userId)
      .executeTakeFirst();
    return !!row;
  }

  // Active Full access members of the space (direct or via group), plus active
  // workspace owners/admins - except in personal spaces, which they cannot reach.
  async findApproverIds(workspaceId: string, spaceId: string): Promise<string[]> {
    const space = await this.db
      .selectFrom('spaces')
      .select(['isPersonal'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!space) return [];

    const ids = new Set<string>();
    if (!space.isPersonal) {
      const wsAdmins = await activeWorkspaceUsers(this.db, workspaceId)
        .select('users.id')
        .where('users.role', 'in', ['owner', 'admin'])
        .execute();
      for (const u of wsAdmins) ids.add(u.id);
    }
    const direct = await activeWorkspaceUsers(this.db, workspaceId)
      .innerJoin('spaceMembers', 'spaceMembers.userId', 'users.id')
      .select('users.id')
      .where('spaceMembers.spaceId', '=', spaceId)
      .where('spaceMembers.role', '=', 'admin')
      .execute();
    const viaGroup = await activeWorkspaceUsers(this.db, workspaceId)
      .innerJoin('groupUsers', 'groupUsers.userId', 'users.id')
      .innerJoin('spaceMembers', 'spaceMembers.groupId', 'groupUsers.groupId')
      .select('users.id')
      .where('spaceMembers.spaceId', '=', spaceId)
      .where('spaceMembers.role', '=', 'admin')
      .execute();
    for (const u of [...direct, ...viaGroup]) ids.add(u.id);
    return [...ids];
  }
}
