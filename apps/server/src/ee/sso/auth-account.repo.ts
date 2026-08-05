import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { AuthAccount } from '@docmost/db/types/entity.types';

@Injectable()
export class AuthAccountRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Links an SSO login to a user by the identity provider's own subject
   * claim, rather than email - so a user keeps their linked account even if
   * their email address changes at the provider afterward.
   */
  async findByProviderUserId(
    authProviderId: string,
    providerUserId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthAccount | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('authAccounts')
      .selectAll()
      .where('authProviderId', '=', authProviderId)
      .where('providerUserId', '=', providerUserId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByUserId(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<{ providerName: string; providerType: string } | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('authAccounts')
      .innerJoin(
        'authProviders',
        'authProviders.id',
        'authAccounts.authProviderId',
      )
      .select([
        'authProviders.name as providerName',
        'authProviders.type as providerType',
      ])
      .where('authAccounts.userId', '=', userId)
      .where('authAccounts.workspaceId', '=', workspaceId)
      .where('authAccounts.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async upsert(
    data: {
      userId: string;
      authProviderId: string;
      providerUserId: string;
      workspaceId: string;
    },
    trx?: KyselyTransaction,
  ): Promise<AuthAccount> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('authAccounts')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['userId', 'authProviderId']).doUpdateSet({
          providerUserId: data.providerUserId,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
