import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { BaseRepo } from './base.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageService } from '../../core/page/services/page.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { Page, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { randomBytes } from 'crypto';
import { executeTx } from '@docmost/db/utils';
import { JsonValue } from '@docmost/db/types/db';
import { buildCsv } from './base-csv';

// ponytail: CSV export is built in memory; stream rows if bases grow past this.
const CSV_EXPORT_MAX_ROWS = 10000;

// 16 hex chars, same shape as before. The previous uuid7 prefix only carried
// 12 random bits, so two properties created in the same millisecond (e.g. the
// kanban seed) could collide on the (page_id, id) primary key.
const newPropertyId = () => randomBytes(8).toString('hex');

const DEFAULT_STATUS_OPTIONS = {
  choices: [
    { id: 'todo', name: 'To Do', color: 'gray', category: 'todo' },
    {
      id: 'inProgress',
      name: 'In Progress',
      color: 'blue',
      category: 'inProgress',
    },
    { id: 'done', name: 'Done', color: 'green', category: 'complete' },
  ],
  choiceOrder: ['todo', 'inProgress', 'done'],
};

@Injectable()
export class BaseService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly baseRepo: BaseRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  private mapDate(d: unknown) {
    return (d as Date)?.toISOString?.() ?? d;
  }

  private mapProperty(p: any) {
    return {
      id: p.id,
      pageId: p.pageId,
      name: p.name,
      type: p.type,
      position: p.position,
      typeOptions: p.typeOptions ?? {},
      pendingType: p.pendingType,
      pendingTypeOptions: p.pendingTypeOptions,
      isPrimary: p.isPrimary,
      workspaceId: p.workspaceId,
      createdAt: this.mapDate(p.createdAt),
      updatedAt: this.mapDate(p.updatedAt),
    };
  }

  private mapView(v: any) {
    return {
      id: v.id,
      pageId: v.pageId,
      name: v.name,
      type: v.type,
      config: v.config ?? {},
      position: v.position,
      workspaceId: v.workspaceId,
      creatorId: v.creatorId,
      createdAt: this.mapDate(v.createdAt),
      updatedAt: this.mapDate(v.updatedAt),
    };
  }

  private mapRow(r: any) {
    return {
      id: r.id,
      pageId: r.pageId,
      cells: r.cells ?? {},
      position: r.position,
      creatorId: r.creatorId,
      lastUpdatedById: r.lastUpdatedById,
      workspaceId: r.workspaceId,
      createdAt: this.mapDate(r.createdAt),
      updatedAt: this.mapDate(r.updatedAt),
    };
  }

  private async assertSpaceAction(
    user: User,
    spaceId: string,
    action: SpaceCaslAction,
  ) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async getBasePageOrThrow(pageId: string, workspaceId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Base not found');
    }
    if (!page.isBase) {
      throw new BadRequestException('Page is not a base');
    }
    return page;
  }

  // Page-level checks (space role + page restrictions + page lock), same as
  // the core page controller; space membership alone ignores restricted pages.
  private async getViewableBase(
    pageId: string,
    user: User,
    workspaceId: string,
  ) {
    const page = await this.getBasePageOrThrow(pageId, workspaceId);
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  private async getEditableBase(
    pageId: string,
    user: User,
    workspaceId: string,
  ) {
    const page = await this.getBasePageOrThrow(pageId, workspaceId);
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }

  private async buildBaseDto(
    page: Page,
    includeChildren = true,
    permissions = { canEdit: true, hasRestriction: false },
  ) {
    const [properties, views] = includeChildren
      ? await Promise.all([
          this.baseRepo
            .getProperties(page.id)
            .then((ps) => ps.map((p) => this.mapProperty(p))),
          this.baseRepo
            .getViews(page.id)
            .then((vs) => vs.map((v) => this.mapView(v))),
        ])
      : [[], []];

    return {
      id: page.id,
      slugId: page.slugId,
      name: page.title,
      icon: page.icon,
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      creatorId: page.creatorId,
      properties,
      views,
      createdAt: this.mapDate(page.createdAt),
      updatedAt: this.mapDate(page.updatedAt),
      baseSchemaVersion: page.baseSchemaVersion ?? 0,
      permissions,
    };
  }

  private async seedDefaultBase(
    pageId: string,
    workspaceId: string,
    userId: string,
    trx: KyselyTransaction,
    template?: string,
  ) {
    const namePropId = newPropertyId();
    const namePosition = generateJitteredKeyBetween(null, null);

    await this.baseRepo.insertProperty(
      {
        id: namePropId,
        pageId,
        name: 'Name',
        type: 'text',
        position: namePosition,
        isPrimary: true,
        typeOptions: { defaultValue: null },
        workspaceId,
      },
      trx,
    );

    let statusPropId: string | undefined;
    if (template === 'kanban') {
      statusPropId = newPropertyId();
      const statusPosition = generateJitteredKeyBetween(namePosition, null);
      await this.baseRepo.insertProperty(
        {
          id: statusPropId,
          pageId,
          name: 'Status',
          type: 'status',
          position: statusPosition,
          typeOptions: DEFAULT_STATUS_OPTIONS as JsonValue,
          workspaceId,
        },
        trx,
      );
    }

    const viewPosition = generateJitteredKeyBetween(null, null);
    const viewType = template === 'kanban' ? 'kanban' : 'table';
    const viewConfig: Record<string, unknown> =
      template === 'kanban' && statusPropId
        ? { groupByPropertyId: statusPropId }
        : {};

    await this.baseRepo.insertView(
      {
        pageId,
        name: template === 'kanban' ? 'Kanban' : 'Table',
        type: viewType,
        position: viewPosition,
        config: viewConfig as JsonValue,
        creatorId: userId,
        workspaceId,
      },
      trx,
    );

    const rowPosition = generateJitteredKeyBetween(null, null);
    const cells: Record<string, unknown> = {};
    await this.baseRepo.insertRow(
      {
        pageId,
        position: rowPosition,
        cells: cells as JsonValue,
        creatorId: userId,
        workspaceId,
      },
      trx,
    );
  }

  async create(
    user: User,
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      icon?: string;
      spaceId: string;
      pageId?: string;
    },
  ) {
    if (data.pageId) {
      // Nested under a page: same rule as core page create (edit on parent).
      const parent = await this.pageRepo.findById(data.pageId);
      if (
        !parent ||
        parent.deletedAt ||
        parent.spaceId !== data.spaceId ||
        parent.workspaceId !== workspaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parent, user);
    } else {
      await this.assertSpaceAction(user, data.spaceId, SpaceCaslAction.Create);
    }

    return executeTx(this.db, async (trx) => {
      const page = await this.pageService.create(
        user.id,
        workspaceId,
        {
          title: data.name,
          spaceId: data.spaceId,
          icon: data.icon,
          parentPageId: data.pageId,
        },
        trx,
        true,
      );

      await this.seedDefaultBase(page.id, workspaceId, user.id, trx);
      return this.buildBaseDto(page);
    });
  }

  async getInfo(pageId: string, user: User, workspaceId: string) {
    const page = await this.getBasePageOrThrow(pageId, workspaceId);
    const permissions =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);
    return this.buildBaseDto(page, true, permissions);
  }

  async update(
    user: User,
    workspaceId: string,
    data: { pageId: string; name?: string; icon?: string; description?: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);

    if (data.name !== undefined || data.icon !== undefined) {
      await this.pageRepo.updatePage(
        {
          ...(data.name !== undefined ? { title: data.name } : {}),
          ...(data.icon !== undefined ? { icon: data.icon } : {}),
          lastUpdatedById: user.id,
        },
        data.pageId,
      );
    }

    const updated = await this.pageRepo.findById(data.pageId);
    return this.buildBaseDto(updated);
  }

  async delete(pageId: string, user: User, workspaceId: string) {
    await this.getEditableBase(pageId, user, workspaceId);
    await this.pageService.removePage(pageId, user.id, workspaceId);
  }

  async convert(
    pageId: string,
    user: User,
    workspaceId: string,
    template?: string,
  ) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanEdit(page, user);
    if (page.isBase) {
      return this.buildBaseDto(page);
    }

    await executeTx(this.db, async (trx) => {
      await this.baseRepo.markPageAsBase(pageId, trx);
      await this.seedDefaultBase(pageId, workspaceId, user.id, trx, template);
    });

    const updated = await this.pageRepo.findById(pageId);
    return this.buildBaseDto(updated);
  }

  async revert(pageId: string, user: User, workspaceId: string) {
    await this.getEditableBase(pageId, user, workspaceId);
    if (await this.baseRepo.hasRowData(pageId)) {
      throw new BadRequestException(
        'Base already contains data and cannot be reverted to a page',
      );
    }
    // Four statements (rows, views, properties, page flag): keep atomic.
    await executeTx(this.db, (trx) =>
      this.baseRepo.revertBaseToPage(pageId, trx),
    );
  }

  async list(
    spaceId: string,
    user: User,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    await this.assertSpaceAction(user, spaceId, SpaceCaslAction.Read);
    const result = await this.baseRepo.listBasesInSpace(
      spaceId,
      workspaceId,
      pagination,
    );
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: result.items.map((p) => p.id),
        userId: user.id,
        spaceId,
      }),
    );
    const items = await Promise.all(
      result.items
        .filter((page) => accessible.has(page.id))
        .map((page) => this.buildBaseDto(page, false)),
    );
    return { ...result, items };
  }

  async createProperty(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      name: string;
      type: string;
      typeOptions?: JsonValue;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);

    const lastPos = await this.baseRepo.getLastPropertyPosition(data.pageId);
    const position = generateJitteredKeyBetween(lastPos, null);
    const property = await this.baseRepo.insertProperty({
      id: newPropertyId(),
      pageId: data.pageId,
      name: data.name.trim(),
      type: data.type,
      position,
      typeOptions: data.typeOptions,
      workspaceId,
    });
    return this.mapProperty(property);
  }

  async updateProperty(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      propertyId: string;
      name?: string;
      type?: string;
      typeOptions?: JsonValue;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);

    const existing = await this.baseRepo.getProperty(
      data.pageId,
      data.propertyId,
    );
    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    const property = await this.baseRepo.updateProperty(
      data.pageId,
      data.propertyId,
      {
        name: data.name?.trim(),
        type: data.type,
        typeOptions: data.typeOptions,
      },
    );
    return { property: this.mapProperty(property), jobId: null };
  }

  async deleteProperty(
    user: User,
    workspaceId: string,
    data: { pageId: string; propertyId: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    const existing = await this.baseRepo.getProperty(
      data.pageId,
      data.propertyId,
    );
    if (!existing) {
      throw new NotFoundException('Property not found');
    }
    if (existing.isPrimary) {
      throw new BadRequestException('Cannot delete primary property');
    }
    await this.baseRepo.softDeleteProperty(data.pageId, data.propertyId);
  }

  async reorderProperty(
    user: User,
    workspaceId: string,
    data: { pageId: string; propertyId: string; position: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    await this.baseRepo.updateProperty(data.pageId, data.propertyId, {
      position: data.position,
    });
  }

  async createRow(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      cells?: Record<string, unknown>;
      position?: string;
      afterRowId?: string;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);

    let position = data.position;
    if (!position) {
      const lastPos = await this.baseRepo.getLastRowPosition(data.pageId);
      position = generateJitteredKeyBetween(lastPos, null);
    }

    const row = await this.baseRepo.insertRow({
      pageId: data.pageId,
      position,
      cells: (data.cells ?? {}) as JsonValue,
      creatorId: user.id,
      workspaceId,
    });
    return this.mapRow(row);
  }

  async getRow(
    rowId: string,
    pageId: string,
    user: User,
    workspaceId: string,
  ) {
    await this.getViewableBase(pageId, user, workspaceId);
    const row = await this.baseRepo.getRow(pageId, rowId);
    if (!row) {
      throw new NotFoundException('Row not found');
    }
    return this.mapRow(row);
  }

  async updateRow(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      rowId: string;
      cells?: Record<string, unknown>;
      position?: string;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    const row = await this.baseRepo.updateRow(data.pageId, data.rowId, {
      cells: data.cells as JsonValue,
      position: data.position,
      lastUpdatedById: user.id,
    });
    if (!row) {
      throw new NotFoundException('Row not found');
    }
    return this.mapRow(row);
  }

  async deleteRow(
    user: User,
    workspaceId: string,
    data: { pageId: string; rowId: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    await this.baseRepo.softDeleteRow(data.pageId, data.rowId);
  }

  async deleteRows(
    user: User,
    workspaceId: string,
    data: { pageId: string; rowIds: string[] },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    await this.baseRepo.softDeleteRows(data.pageId, data.rowIds);
  }

  async listRows(
    pageId: string,
    user: User,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    await this.getViewableBase(pageId, user, workspaceId);
    const result = await this.baseRepo.listRows(pageId, pagination);
    return {
      ...result,
      items: result.items.map((r) => this.mapRow(r)),
      references: { users: {}, pages: {} },
    };
  }

  async reorderRow(
    user: User,
    workspaceId: string,
    data: { pageId: string; rowId: string; position: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    await this.baseRepo.updateRow(data.pageId, data.rowId, {
      position: data.position,
      lastUpdatedById: user.id,
    });
  }

  async createView(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      name: string;
      type?: string;
      config?: JsonValue;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    const views = await this.baseRepo.getViews(data.pageId);
    const lastPos = views.length > 0 ? views[views.length - 1].position : null;
    const view = await this.baseRepo.insertView({
      pageId: data.pageId,
      name: data.name,
      type: data.type ?? 'table',
      position: generateJitteredKeyBetween(lastPos, null),
      config: data.config,
      creatorId: user.id,
      workspaceId,
    });
    return this.mapView(view);
  }

  async updateView(
    user: User,
    workspaceId: string,
    data: {
      pageId: string;
      viewId: string;
      name?: string;
      type?: string;
      config?: JsonValue;
      position?: string;
    },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    const view = await this.baseRepo.updateView(data.pageId, data.viewId, data);
    if (!view) {
      throw new NotFoundException('View not found');
    }
    return this.mapView(view);
  }

  async deleteView(
    user: User,
    workspaceId: string,
    data: { pageId: string; viewId: string },
  ) {
    await this.getEditableBase(data.pageId, user, workspaceId);
    const views = await this.baseRepo.getViews(data.pageId);
    if (views.length <= 1) {
      throw new BadRequestException('Cannot delete the last view');
    }
    await this.baseRepo.deleteView(data.pageId, data.viewId);
  }

  async listViews(pageId: string, user: User, workspaceId: string) {
    await this.getViewableBase(pageId, user, workspaceId);
    const views = await this.baseRepo.getViews(pageId);
    return views.map((v) => this.mapView(v));
  }

  async expandPages(pageIds: string[], user: User, workspaceId: string) {
    const fetched = await this.baseRepo.expandPages(
      pageIds,
      workspaceId,
      this.spaceMemberRepo.getUserSpaceIdsQuery(user.id),
    );
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: fetched.map((r) => r.id),
        userId: user.id,
      }),
    );
    const rows = fetched.filter((r) => accessible.has(r.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        slugId: r.slugId,
        title: r.title,
        icon: r.icon,
        spaceId: r.spaceId,
        space: r.spaceRefId
          ? { id: r.spaceRefId, slug: r.spaceSlug, name: r.spaceName }
          : null,
      })),
    };
  }

  async exportCsv(pageId: string, user: User, workspaceId: string) {
    const base = await this.getInfo(pageId, user, workspaceId);
    const rows = await this.baseRepo.listRows(pageId, {
      limit: CSV_EXPORT_MAX_ROWS,
    } as PaginationOptions);
    const csv = buildCsv(base.properties, rows.items);
    const fileName = `${base.name || 'base'}.csv`;
    return { csv, fileName };
  }
}
