import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

/** `users` query scoped to the workspace's non-deleted, non-deactivated users. */
export const activeWorkspaceUsers = (
  db: KyselyDB | KyselyTransaction,
  workspaceId: string,
) =>
  db
    .selectFrom('users')
    .where('users.workspaceId', '=', workspaceId)
    .where('users.deletedAt', 'is', null)
    .where('users.deactivatedAt', 'is', null);
