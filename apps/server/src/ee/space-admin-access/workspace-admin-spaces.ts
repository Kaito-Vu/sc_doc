import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceRole, UserRole } from '../../common/helpers/types/permission';

/*
 * Workspace owners/admins implicitly hold the space ADMIN role in every
 * (non-personal) space of their workspace, without a space_members row.
 * These fragments are unioned into the space-membership queries.
 */
const adminSpaces = (db: KyselyDB, userId: string) =>
  db
    .selectFrom('spaces')
    .innerJoin('users', 'users.workspaceId', 'spaces.workspaceId')
    .where('users.id', '=', userId)
    .where('users.role', 'in', [UserRole.OWNER, UserRole.ADMIN])
    .where('users.deletedAt', 'is', null)
    .where('users.deactivatedAt', 'is', null)
    .where('spaces.deletedAt', 'is', null)
    .where('spaces.isPersonal', '=', false);

export const adminSpaceIdsQuery = (db: KyselyDB, userId: string) =>
  adminSpaces(db, userId).select('spaces.id');

export const adminSpaceRoleQuery = (
  db: KyselyDB,
  userId: string,
  spaceId: string,
) =>
  adminSpaces(db, userId)
    .where('spaces.id', '=', spaceId)
    .select(['users.id as userId', sql<string>`${SpaceRole.ADMIN}`.as('role')]);

export const adminSpacesRolesQuery = (
  db: KyselyDB,
  userId: string,
  spaceIds: string[],
) =>
  adminSpaces(db, userId)
    .where('spaces.id', 'in', spaceIds)
    .select(['spaces.id as spaceId', sql<string>`${SpaceRole.ADMIN}`.as('role')]);

// Owners/admins bypass page-level restrictions.
export const isWorkspaceAdmin = async (db: KyselyDB, userId: string) =>
  !!(await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', userId)
    .where('role', 'in', [UserRole.OWNER, UserRole.ADMIN])
    .where('deletedAt', 'is', null)
    .where('deactivatedAt', 'is', null)
    .executeTakeFirst());
