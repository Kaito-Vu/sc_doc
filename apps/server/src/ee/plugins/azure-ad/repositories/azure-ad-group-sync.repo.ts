import { Injectable, Logger } from '@nestjs/common'
import { InjectKysely } from 'nestjs-kysely'
import { Kysely } from 'kysely'

export interface AzureAdUserGroup {
  id: string
  userId: string
  workspaceId: string
  groupId: string
  groupName: string
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class AzureAdGroupSyncRepository {
  private readonly logger = new Logger(AzureAdGroupSyncRepository.name)

  constructor(@InjectKysely() private readonly db: Kysely<any>) {}

  async syncUserGroups(
    userId: string,
    workspaceId: string,
    groups: Array<{ id: string; displayName: string }>
  ): Promise<void> {
    // Get existing groups for this user
    const existing = await this.getUserGroups(userId, workspaceId)
    const existingIds = new Set(existing.map((g) => g.groupId))
    const newIds = new Set(groups.map((g) => g.id))

    // Delete groups that are no longer member of
    const toDelete = existing.filter((g) => !newIds.has(g.groupId))
    for (const group of toDelete) {
      await this.deleteUserGroup(userId, workspaceId, group.groupId)
    }

    // Insert new groups
    const toAdd = groups.filter((g) => !existingIds.has(g.id))
    for (const group of toAdd) {
      await this.createUserGroup(userId, workspaceId, group.id, group.displayName)
    }

    this.logger.debug(
      `Synced groups for user ${userId}: deleted ${toDelete.length}, added ${toAdd.length}`
    )
  }

  async getUserGroups(
    userId: string,
    workspaceId: string
  ): Promise<AzureAdUserGroup[]> {
    const groups = await this.db
      .selectFrom('azure_ad_user_groups')
      .selectAll()
      .where('user_id', '=', userId)
      .where('workspace_id', '=', workspaceId)
      .execute()

    return groups as AzureAdUserGroup[]
  }

  async createUserGroup(
    userId: string,
    workspaceId: string,
    groupId: string,
    groupName: string
  ): Promise<AzureAdUserGroup> {
    const now = new Date()
    const result = await this.db
      .insertInto('azure_ad_user_groups')
      .values({
        user_id: userId,
        workspace_id: workspaceId,
        group_id: groupId,
        group_name: groupName,
        created_at: now,
        updated_at: now,
      })
      .returning(['id', 'user_id', 'workspace_id', 'group_id', 'group_name', 'created_at', 'updated_at'])
      .executeTakeFirst()

    if (!result) {
      throw new Error('Failed to create user group')
    }

    return {
      id: result.id,
      userId: result.user_id,
      workspaceId: result.workspace_id,
      groupId: result.group_id,
      groupName: result.group_name,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    }
  }

  async deleteUserGroup(
    userId: string,
    workspaceId: string,
    groupId: string
  ): Promise<void> {
    await this.db
      .deleteFrom('azure_ad_user_groups')
      .where('user_id', '=', userId)
      .where('workspace_id', '=', workspaceId)
      .where('group_id', '=', groupId)
      .execute()
  }

  async deleteUserAllGroups(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('azure_ad_user_groups')
      .where('user_id', '=', userId)
      .where('workspace_id', '=', workspaceId)
      .execute()
  }

  async getWorkspaceGroupStats(workspaceId: string): Promise<{
    totalUsers: number
    totalGroups: number
  }> {
    const result = await this.db
      .selectFrom('azure_ad_user_groups')
      .select([
        this.db.fn.count('distinct user_id').as('totalUsers'),
        this.db.fn.count('distinct group_id').as('totalGroups'),
      ])
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()

    return {
      totalUsers: result?.totalUsers ? Number(result.totalUsers) : 0,
      totalGroups: result?.totalGroups ? Number(result.totalGroups) : 0,
    }
  }
}
