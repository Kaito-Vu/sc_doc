import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableUserMFA,
  UpdatableUserMFA,
  UserMFA,
} from '@docmost/db/types/entity.types';

@Injectable()
export class UserMfaRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByUserId(userId: string): Promise<UserMFA | undefined> {
    return this.db
      .selectFrom('userMfa')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  async upsert(
    data: InsertableUserMFA,
    trx?: KyselyTransaction,
  ): Promise<UserMFA> {
    const db = dbOrTx(this.db, trx);
    const existing = await db
      .selectFrom('userMfa')
      .select('id')
      .where('userId', '=', data.userId)
      .executeTakeFirst();

    if (existing) {
      return db
        .updateTable('userMfa')
        .set({ ...data, updatedAt: new Date() })
        .where('userId', '=', data.userId)
        .returningAll()
        .executeTakeFirst();
    }

    return db
      .insertInto('userMfa')
      .values(data)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Removes one backup-code hash in a single statement; returns false when
   * it was already consumed (e.g. by a concurrent request).
   */
  async consumeBackupCode(userId: string, hash: string): Promise<boolean> {
    const row = await this.db
      .updateTable('userMfa')
      .set({
        backupCodes: sql`array_remove(backup_codes, ${hash})`,
        updatedAt: new Date(),
      })
      .where('userId', '=', userId)
      .where(sql<boolean>`${hash} = ANY(backup_codes)`)
      .returning('id')
      .executeTakeFirst();
    return !!row;
  }

  async update(
    userId: string,
    data: UpdatableUserMFA,
    trx?: KyselyTransaction,
  ): Promise<UserMFA> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('userMfa')
      .set({ ...data, updatedAt: new Date() })
      .where('userId', '=', userId)
      .returningAll()
      .executeTakeFirst();
  }
}
