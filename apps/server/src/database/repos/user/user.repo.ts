import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { DB, Users } from '@docmost/db/types/db';
import { hashPassword } from '../../../common/helpers';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableUser,
  UpdatableUser,
  User,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { ExpressionBuilder, sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { NotificationSettingKey } from '../../../core/notification/notification.constants';
import { CoreHooks } from '../../../core/plugins/plugin-hooks';
import { runHook } from '../../../core/plugins/run-hook';

@Injectable()
export class UserRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof Users> = [
    'id',
    'email',
    'name',
    'emailVerifiedAt',
    'avatarUrl',
    'role',
    'workspaceId',
    'locale',
    'timezone',
    'settings',
    'lastLoginAt',
    'deactivatedAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'hasGeneratedPassword',
  ];

  async findById(
    userId: string,
    workspaceId: string,
    opts?: {
      includePassword?: boolean;
      includeUserMfa?: boolean;
      includeScimExternalId?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<User> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('users')
      .select(this.baseFields)
      .$if(opts?.includePassword, (qb) => qb.select('password'))
      .$if(opts?.includeUserMfa, (qb) => qb.select(this.withUserMfa))
      .$if(opts?.includeScimExternalId, (qb) => qb.select('scimExternalId'))
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findByEmail(
    email: string,
    workspaceId: string,
    opts?: {
      includePassword?: boolean;
      includeUserMfa?: boolean;
      includeScimExternalId?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<User> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('users')
      .select(this.baseFields)
      .$if(opts?.includePassword, (qb) => qb.select('password'))
      .$if(opts?.includeUserMfa, (qb) => qb.select(this.withUserMfa))
      .$if(opts?.includeScimExternalId, (qb) => qb.select('scimExternalId'))
      .where(sql`LOWER(email)`, '=', sql`LOWER(${email})`)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async updateUser(
    updatableUser: UpdatableUser,
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);

    return await db
      .updateTable('users')
      .set({ ...updatableUser, updatedAt: new Date() })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async updateLastLogin(userId: string, workspaceId: string) {
    return await this.db
      .updateTable('users')
      .set({
        lastLoginAt: new Date(),
      })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async insertUser(
    insertableUser: InsertableUser,
    trx?: KyselyTransaction,
    opts?: { pageEditMode?: string },
  ): Promise<User> {
    const user: InsertableUser = {
      name:
        insertableUser.name || insertableUser.email.split('@')[0].toLowerCase(),
      email: insertableUser.email.toLowerCase(),
      password: await hashPassword(insertableUser.password),
      locale: 'en-US',
      role: insertableUser?.role,
      lastLoginAt: new Date(),
    };

    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('users')
      .values({
        ...insertableUser,
        ...user,
        ...(opts?.pageEditMode
          ? {
              settings: sql`${JSON.stringify({
                preferences: { pageEditMode: opts.pageEditMode },
              })}::text::jsonb`,
            }
          : {}),
      })
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async roleCountByWorkspaceId(
    role: string,
    workspaceId: string,
  ): Promise<number> {
    const { count } = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('role').as('count'))
      .where('role', '=', role)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    return count as number;
  }

  async getUsersPaginated(
    workspaceId: string,
    pagination: PaginationOptions & { providerId?: string },
  ) {
    let query = this.db
      .selectFrom('users')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    if (pagination.query) {
      query = query.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or(
          sql`users.email`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ),
      );
    }

    // Lets an EE plugin (ee/sso) enrich/filter this query with auth
    // provider data — core has no knowledge of auth_providers/auth_accounts.
    // No-op (returns context unchanged) when no handler is registered.
    ({ query } = await runHook(CoreHooks.BEFORE_MEMBERS_QUERY, {
      query,
      workspaceId,
      providerId: pagination.providerId,
    }));

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'name', direction: 'asc' },
        { expression: 'id', direction: 'asc' },
      ],
      parseCursor: (cursor) => ({ name: cursor.name, id: cursor.id }),
    });
  }

  async updatePreference(
    userId: string,
    prefKey: string,
    prefValue: string | boolean,
  ) {
    return await this.db
      .updateTable('users')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('preferences', COALESCE(settings->'preferences', '{}'::jsonb) 
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateNotificationSetting(
    userId: string,
    settingKey: NotificationSettingKey,
    settingValue: boolean,
  ) {
    return await this.db
      .updateTable('users')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('notifications', COALESCE(settings->'notifications', '{}'::jsonb)
                || jsonb_build_object(${sql.lit(settingKey)}, ${sql.lit(settingValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  withUserMfa(eb: ExpressionBuilder<DB, 'users'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('userMfa')
        .select([
          'userMfa.id',
          'userMfa.method',
          'userMfa.isEnabled',
          'userMfa.createdAt',
        ])
        .whereRef('userMfa.userId', '=', 'users.id'),
    ).as('mfa');
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countActiveByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countNeverLoggedInByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('lastLoginAt', 'is', null)
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async countJoinedByWeek(
    workspaceId: string,
    weeksBack: number,
  ): Promise<{ weekStart: Date; count: number }[]> {
    const since = new Date(
      Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000,
    );
    const rows = await this.db
      .selectFrom('users')
      .select((eb) => [
        sql<Date>`date_trunc('week', "created_at")`.as('weekStart'),
        eb.fn.count('id').as('count'),
      ])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .groupBy(sql`date_trunc('week', "created_at")`)
      .orderBy(sql`date_trunc('week', "created_at")`, 'asc')
      .execute();

    return rows.map((r) => ({
      weekStart: r.weekStart as Date,
      count: Number(r.count),
    }));
  }

}
