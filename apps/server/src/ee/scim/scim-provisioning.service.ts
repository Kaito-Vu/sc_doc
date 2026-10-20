import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { executeTx } from '@docmost/db/utils';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { GroupService } from '../../core/group/services/group.service';
import { User } from '@docmost/db/types/entity.types';
import { nanoIdGen } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';

const MAX_PAGE_SIZE = 200;

/** SCIM paging is 1-based; clamp untrusted query values to sane bounds. */
function toPage(startIndex: number, count: number) {
  const start = Math.max(1, Math.floor(startIndex) || 1);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(0, Math.floor(count) || 0));
  return { start, size, offset: start - 1 };
}

// Core user/group operations need an acting user. SCIM acts with admin rights, so
// core's owner protections (admin cannot deactivate/delete an owner) apply.
const SCIM_ACTOR = { id: 'scim', role: UserRole.ADMIN } as User;

@Injectable()
export class ScimProvisioningService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly groupRepo: GroupRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly workspaceService: WorkspaceService,
    private readonly groupService: GroupService,
  ) {}

  private mapUser(user: any) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: user.scimExternalId ?? undefined,
      userName: user.email,
      name: { formatted: user.name },
      emails: [{ value: user.email, primary: true }],
      active: !user.deactivatedAt && !user.deletedAt,
      meta: {
        resourceType: 'User',
        created: user.createdAt,
        lastModified: user.updatedAt,
      },
    };
  }

  private mapGroup(group: any, members: string[] = []) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id,
      externalId: group.scimExternalId ?? undefined,
      displayName: group.name,
      members: members.map((id) => ({ value: id })),
      meta: {
        resourceType: 'Group',
        created: group.createdAt,
        lastModified: group.updatedAt,
      },
    };
  }

  async listUsers(workspaceId: string, startIndex = 1, count = 100) {
    const page = toPage(startIndex, count);
    const rows = await this.db
      .selectFrom('users')
      .select([
        'id',
        'email',
        'name',
        'scimExternalId',
        'deactivatedAt',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .offset(page.offset)
      .limit(page.size)
      .execute();

    const total = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: Number(total?.count ?? 0),
      startIndex: page.start,
      itemsPerPage: rows.length,
      Resources: rows.map((u) => this.mapUser(u)),
    };
  }

  async getUser(workspaceId: string, userId: string) {
    const user = await this.userRepo.findById(userId, workspaceId, {
      includeScimExternalId: true,
    });
    if (!user) throw new NotFoundException();
    return this.mapUser(user);
  }

  async createUser(workspaceId: string, body: any) {
    const email =
      body?.emails?.[0]?.value || body?.userName || body?.email;
    if (typeof email !== 'string' || !email.includes('@')) {
      throw new BadRequestException('userName or emails required');
    }
    const existing = await this.userRepo.findByEmail(email, workspaceId);
    if (existing) {
      return this.mapUser(existing);
    }
    // Same provisioning as signup/SSO: workspace default role + default group
    // (the default group is what grants default space access).
    const user = await executeTx(this.db, async (trx) => {
      const created = await this.userRepo.insertUser(
        {
          email,
          name:
            body?.name?.formatted || body?.displayName || email.split('@')[0],
          password: nanoIdGen(16),
          role: UserRole.MEMBER,
          workspaceId,
          scimExternalId: body?.externalId ?? null,
          hasGeneratedPassword: true,
        } as any,
        trx,
      );
      await this.workspaceService.addUserToWorkspace(
        created.id,
        workspaceId,
        undefined,
        trx,
      );
      await this.groupUserRepo.addUserToDefaultGroup(
        created.id,
        workspaceId,
        trx,
      );
      return created;
    });
    return this.mapUser(user);
  }

  async replaceUser(workspaceId: string, userId: string, body: any) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user || user.deletedAt) throw new NotFoundException();

    const rawEmail = body?.emails?.[0]?.value || body?.userName;
    const email =
      typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : user.email;
    if (email !== user.email.toLowerCase()) {
      if (!email.includes('@')) {
        throw new BadRequestException('A valid email is required');
      }
      const taken = await this.userRepo.findByEmail(email, workspaceId);
      if (taken && taken.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
    }

    // Status goes through core so sessions, websockets, integrations and audit
    // are handled. An omitted `active` leaves the current status untouched.
    if (body?.active === false && !user.deactivatedAt) {
      await this.workspaceService.deactivateUser(SCIM_ACTOR, userId, workspaceId);
    } else if (body?.active === true && user.deactivatedAt) {
      await this.workspaceService.activateUser(SCIM_ACTOR, userId, workspaceId);
    }

    await this.userRepo.updateUser(
      {
        email,
        name: body?.name?.formatted || user.name,
        scimExternalId: body?.externalId ?? user.scimExternalId,
      } as any,
      userId,
      workspaceId,
    );
    return this.getUser(workspaceId, userId);
  }

  async deleteUser(workspaceId: string, userId: string) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user || user.deletedAt) throw new NotFoundException();
    // Core delete: blocks owners, anonymises, removes memberships/sessions.
    await this.workspaceService.deleteUser(SCIM_ACTOR, userId, workspaceId);
  }

  async listGroups(workspaceId: string, startIndex = 1, count = 100) {
    const page = toPage(startIndex, count);
    const groups = await this.db
      .selectFrom('groups')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .offset(page.offset)
      .limit(page.size)
      .execute();

    // One query for all groups' members instead of one per group.
    const membersByGroup = new Map<string, string[]>();
    if (groups.length) {
      const rows = await this.db
        .selectFrom('groupUsers')
        .select(['groupId', 'userId'])
        .where(
          'groupId',
          'in',
          groups.map((g) => g.id),
        )
        .execute();
      for (const row of rows) {
        const list = membersByGroup.get(row.groupId) ?? [];
        list.push(row.userId);
        membersByGroup.set(row.groupId, list);
      }
    }
    const resources = groups.map((group) =>
      this.mapGroup(group, membersByGroup.get(group.id) ?? []),
    );

    const total = await this.db
      .selectFrom('groups')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: Number(total?.count ?? 0),
      startIndex: page.start,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  async getGroup(workspaceId: string, groupId: string) {
    const group = await this.groupRepo.findById(groupId, workspaceId, {
      includeScimExternalId: true,
    });
    if (!group) throw new NotFoundException();
    const members = await this.db
      .selectFrom('groupUsers')
      .select('userId')
      .where('groupId', '=', groupId)
      .execute();
    return this.mapGroup(
      group,
      members.map((m) => m.userId),
    );
  }

  async createGroup(workspaceId: string, body: any) {
    const name = body?.displayName;
    if (!name) throw new BadRequestException('displayName required');
    if (await this.groupRepo.findByName(name, workspaceId)) {
      throw new ConflictException('A group with this name already exists');
    }
    const group = await this.groupRepo.insertGroup({
      name,
      workspaceId,
      scimExternalId: body?.externalId ?? null,
      isDefault: false,
      isExternal: true,
    } as any);
    return this.mapGroup(group, []);
  }

  async replaceGroup(workspaceId: string, groupId: string, body: any) {
    const group = await this.groupRepo.findById(groupId, workspaceId);
    if (!group) throw new NotFoundException();
    await this.groupRepo.update(
      {
        name: body?.displayName || group.name,
        scimExternalId: body?.externalId ?? group.scimExternalId,
      } as any,
      groupId,
      workspaceId,
    );
    return this.getGroup(workspaceId, groupId);
  }

  async deleteGroup(workspaceId: string, groupId: string) {
    // Core delete: refuses default groups and revokes access of members.
    await this.groupService.deleteGroup(groupId, workspaceId);
  }
}
