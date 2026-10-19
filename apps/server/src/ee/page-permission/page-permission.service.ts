import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { Page, User } from '@docmost/db/types/entity.types';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../common/helpers/types/permission';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { executeTx } from '@docmost/db/utils';
import { WsService } from '../../ws/ws.service';
import { CollabAccessService } from '../../collaboration/services/collab-access.service';

@Injectable()
export class PagePermissionService {
  constructor(
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    private readonly wsService: WsService,
    private readonly collabAccess: CollabAccessService,
  ) {}

  private async getPageOrThrow(pageId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  // Space admins (incl. workspace owners/admins) always manage. Otherwise a
  // restricted page (direct or inherited) needs page-level writer access;
  // space-level Manage(Page) alone is not enough since space writers hold it.
  private async canManagePermissions(
    user: User,
    page: Page,
  ): Promise<boolean> {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      return true;
    }

    const { hasAnyRestriction, canEdit } =
      await this.pagePermissionRepo.canUserEditPage(user.id, page.id);
    if (hasAnyRestriction) {
      return canEdit;
    }

    if (page.creatorId === user.id) {
      return true;
    }

    return ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  }

  private async assertCanManage(user: User, page: Page): Promise<void> {
    if (!(await this.canManagePermissions(user, page))) {
      throw new ForbiddenException();
    }
  }

  // Drop live sessions/subscriptions that may have just lost access.
  private async onAccessReduced(page: Page): Promise<void> {
    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);
    await this.collabAccess.recheckAccess({ pageIds: [page.id] });
    await this.wsService.removeBaseSubscribersWithoutAccess([page.id]);
  }

  private async getPageAccessOrThrow(pageId: string, message: string) {
    const pageAccess =
      await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    if (!pageAccess) {
      throw new BadRequestException(message);
    }
    return pageAccess;
  }

  // Locks the page_access row so concurrent removals/demotions serialize
  // and cannot together strip the last writer.
  private async lockPageAccess(pageAccessId: string, trx: KyselyTransaction) {
    await trx
      .selectFrom('pageAccess')
      .select('id')
      .where('id', '=', pageAccessId)
      .forUpdate()
      .executeTakeFirst();
  }

  private async assertKeepsAWriter(
    pageAccessId: string,
    target: { userIds: string[]; groupIds: string[] },
    message: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    const { userIds, groupIds } = target;
    if (userIds.length === 0 && groupIds.length === 0) return;

    const row = await trx
      .selectFrom('pagePermissions')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('pageAccessId', '=', pageAccessId)
      .where('role', '=', PagePermissionRole.WRITER)
      .where((eb) =>
        eb.or([
          ...(userIds.length > 0 ? [eb('userId', 'in', userIds)] : []),
          ...(groupIds.length > 0 ? [eb('groupId', 'in', groupIds)] : []),
        ]),
      )
      .executeTakeFirst();
    const removing = Number(row?.count ?? 0);
    if (removing === 0) return;

    const writerCount =
      await this.pagePermissionRepo.countWritersByPageAccessId(pageAccessId, {
        trx,
      });
    if (writerCount <= removing) {
      throw new BadRequestException(message);
    }
  }

  // Only members of this workspace that are not already on the page.
  private async filterNewMembers(
    pageAccessId: string,
    workspaceId: string,
    userIds: string[],
    groupIds: string[],
  ): Promise<{ userIds: string[]; groupIds: string[] }> {
    const [users, groups] = await Promise.all([
      userIds.length === 0
        ? []
        : this.db
            .selectFrom('users')
            .select('users.id')
            .where('users.id', 'in', userIds)
            .where('users.workspaceId', '=', workspaceId)
            .where('users.deletedAt', 'is', null)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('pagePermissions')
                    .select('pagePermissions.id')
                    .whereRef('pagePermissions.userId', '=', 'users.id')
                    .where('pagePermissions.pageAccessId', '=', pageAccessId),
                ),
              ),
            )
            .execute(),
      groupIds.length === 0
        ? []
        : this.db
            .selectFrom('groups')
            .select('groups.id')
            .where('groups.id', 'in', groupIds)
            .where('groups.workspaceId', '=', workspaceId)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('pagePermissions')
                    .select('pagePermissions.id')
                    .whereRef('pagePermissions.groupId', '=', 'groups.id')
                    .where('pagePermissions.pageAccessId', '=', pageAccessId),
                ),
              ),
            )
            .execute(),
    ]);
    return {
      userIds: users.map((u) => u.id),
      groupIds: groups.map((g) => g.id),
    };
  }

  private async getInheritedFrom(pageId: string) {
    const row = await this.db
      .withRecursive('ancestors', (qb) =>
        qb
          .selectFrom('pages')
          .select([
            'pages.id as ancestorId',
            'pages.parentPageId',
            sql<number>`0`.as('depth'),
          ])
          .where('pages.id', '=', pageId)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin('ancestors', 'ancestors.parentPageId', 'pages.id')
              .select([
                'pages.id as ancestorId',
                'pages.parentPageId',
                sql<number>`ancestors.depth + 1`.as('depth'),
              ]),
          ),
      )
      .selectFrom('ancestors')
      .innerJoin('pageAccess', 'pageAccess.pageId', 'ancestors.ancestorId')
      .innerJoin('pages', 'pages.id', 'ancestors.ancestorId')
      .select(['pages.id', 'pages.slugId', 'pages.title'])
      .where('ancestors.depth', '>', 0)
      .orderBy('ancestors.depth', 'asc')
      .executeTakeFirst();

    if (!row) return undefined;
    return { id: row.id, slugId: row.slugId, title: row.title };
  }

  async restrictPage(pageId: string, user: User, workspaceId: string) {
    const page = await this.getPageOrThrow(pageId);
    await this.pageAccessService.validateCanEdit(page, user);
    await this.assertCanManage(user, page);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (existing) {
      throw new BadRequestException('Page is already restricted');
    }

    await executeTx(this.db, async (trx) => {
      const pageAccess = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId,
          spaceId: page.spaceId,
          accessLevel: PageAccessLevel.RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );

      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: pageAccess.id,
            userId: user.id,
            role: PagePermissionRole.WRITER,
            addedById: user.id,
          },
        ],
        trx,
      );
    });

    await this.onAccessReduced(page);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });
  }

  async unrestrictPage(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    await this.assertCanManage(user, page);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      return;
    }

    await this.pagePermissionRepo.deletePageAccess(page.id);
    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });
  }

  async addPermission(
    data: {
      pageId: string;
      role: string;
      userIds?: string[];
      groupIds?: string[];
    },
    user: User,
    workspaceId: string,
  ) {
    const page = await this.getPageOrThrow(data.pageId);
    await this.assertCanManage(user, page);

    const pageAccess = await this.getPageAccessOrThrow(
      page.id,
      'Page must be restricted first',
    );

    if (!data.userIds?.length && !data.groupIds?.length) {
      throw new BadRequestException('No members specified');
    }
    const { userIds, groupIds } = await this.filterNewMembers(
      pageAccess.id,
      workspaceId,
      data.userIds ?? [],
      data.groupIds ?? [],
    );
    if (userIds.length === 0 && groupIds.length === 0) {
      return;
    }

    const permissions = [
      ...userIds.map((userId) => ({
        pageAccessId: pageAccess.id,
        userId,
        role: data.role,
        addedById: user.id,
      })),
      ...groupIds.map((groupId) => ({
        pageAccessId: pageAccess.id,
        groupId,
        role: data.role,
        addedById: user.id,
      })),
    ];

    await this.pagePermissionRepo.insertPagePermissions(permissions);

    if (userIds.length > 0) {
      await this.notificationQueue.add(QueueJob.PAGE_PERMISSION_GRANTED, {
        userIds,
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId,
        actorId: user.id,
        role: data.role,
      });
    }

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_ADDED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { role: data.role, userIds, groupIds },
    });
  }

  async removePermission(
    data: { pageId: string; userIds?: string[]; groupIds?: string[] },
    user: User,
  ) {
    const page = await this.getPageOrThrow(data.pageId);
    await this.assertCanManage(user, page);

    const pageAccess = await this.getPageAccessOrThrow(
      page.id,
      'Page is not restricted',
    );

    const userIds = data.userIds ?? [];
    const groupIds = data.groupIds ?? [];

    await executeTx(this.db, async (trx) => {
      await this.lockPageAccess(pageAccess.id, trx);
      await this.assertKeepsAWriter(
        pageAccess.id,
        { userIds, groupIds },
        'Cannot remove the last writer',
        trx,
      );
      await this.pagePermissionRepo.deletePagePermissionsByUserIds(
        pageAccess.id,
        userIds,
        trx,
      );
      await this.pagePermissionRepo.deletePagePermissionsByGroupIds(
        pageAccess.id,
        groupIds,
        trx,
      );
    });

    await this.onAccessReduced(page);

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { userIds, groupIds },
    });
  }

  async updatePermissionRole(
    data: {
      pageId: string;
      role: string;
      userId?: string;
      groupId?: string;
    },
    user: User,
  ) {
    // Without a target the repo update would rewrite every permission row.
    if (!data.userId === !data.groupId) {
      throw new BadRequestException('Specify exactly one of userId or groupId');
    }

    const page = await this.getPageOrThrow(data.pageId);
    await this.assertCanManage(user, page);

    const pageAccess = await this.getPageAccessOrThrow(
      page.id,
      'Page is not restricted',
    );

    const demoting = data.role !== PagePermissionRole.WRITER;
    await executeTx(this.db, async (trx) => {
      if (demoting) {
        await this.lockPageAccess(pageAccess.id, trx);
        await this.assertKeepsAWriter(
          pageAccess.id,
          {
            userIds: data.userId ? [data.userId] : [],
            groupIds: data.groupId ? [data.groupId] : [],
          },
          'Cannot demote the last writer',
          trx,
        );
      }
      await this.pagePermissionRepo.updatePagePermissionRole(
        pageAccess.id,
        data.role,
        { userId: data.userId, groupId: data.groupId },
        trx,
      );
    });

    if (demoting) {
      await this.onAccessReduced(page);
    }
  }

  async getPermissions(pageId: string, user: User, pagination: PaginationOptions) {
    const page = await this.getPageOrThrow(pageId);
    await this.pageAccessService.validateCanView(page, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      return { items: [], meta: { hasNextPage: false, hasPreviousPage: false } };
    }

    return this.pagePermissionRepo.getPagePermissionsPaginated(
      pageAccess.id,
      pagination,
    );
  }

  async getRestrictionInfo(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    await this.pageAccessService.validateCanView(page, user);

    const [pageAccess, accessLevel, canManage] = await Promise.all([
      this.pagePermissionRepo.findPageAccessByPageId(page.id),
      this.pagePermissionRepo.getUserPageAccessLevel(user.id, page.id),
      this.canManagePermissions(user, page),
    ]);

    const inheritedFrom =
      accessLevel.hasInheritedRestriction && !accessLevel.hasDirectRestriction
        ? await this.getInheritedFrom(page.id)
        : undefined;

    return {
      restrictionId: pageAccess?.id,
      hasDirectRestriction: accessLevel.hasDirectRestriction,
      hasInheritedRestriction: accessLevel.hasInheritedRestriction,
      inheritedFrom,
      userAccess: {
        canView: accessLevel.canAccess,
        canEdit: accessLevel.canEdit,
        canManage,
      },
    };
  }
}
