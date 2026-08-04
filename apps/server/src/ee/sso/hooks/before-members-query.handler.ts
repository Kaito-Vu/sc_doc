import { Injectable } from '@nestjs/common';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

export interface MembersQueryHookContext {
  query: any;
  workspaceId: string;
  providerId?: string;
}

/**
 * Enriches/filters the workspace Members list query (core:
 * user.repo.ts#getUsersPaginated) with SSO provider data, entirely from
 * ee/sso — core only dispatches the `workspace:beforeMembersQuery` hook and
 * has no knowledge of auth_providers/auth_accounts. Uses a correlated
 * subquery (not a join) so a user with multiple auth_accounts rows can never
 * duplicate a row in the paginated result, and the cursor pagination's own
 * ORDER BY is unaffected.
 */
@Injectable()
export class BeforeMembersQueryHandler {
  async handle(
    context: MembersQueryHookContext,
  ): Promise<MembersQueryHookContext> {
    let query = context.query.select((eb: any) =>
      jsonObjectFrom(
        eb
          .selectFrom('authAccounts')
          .innerJoin(
            'authProviders',
            'authProviders.id',
            'authAccounts.authProviderId',
          )
          .select(['authProviders.id', 'authProviders.name', 'authProviders.type'])
          .whereRef('authAccounts.userId', '=', 'users.id')
          .where('authAccounts.deletedAt', 'is', null)
          .orderBy('authAccounts.updatedAt', 'desc')
          .limit(1),
      ).as('authProvider'),
    );

    if (context.providerId === 'local') {
      query = query.where((eb: any) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('authAccounts')
              .select('authAccounts.id')
              .whereRef('authAccounts.userId', '=', 'users.id')
              .where('authAccounts.deletedAt', 'is', null),
          ),
        ),
      );
    } else if (context.providerId) {
      query = query.where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('authAccounts')
            .select('authAccounts.id')
            .whereRef('authAccounts.userId', '=', 'users.id')
            .where('authAccounts.deletedAt', 'is', null)
            .where('authAccounts.authProviderId', '=', context.providerId),
        ),
      );
    }

    return { ...context, query };
  }
}
