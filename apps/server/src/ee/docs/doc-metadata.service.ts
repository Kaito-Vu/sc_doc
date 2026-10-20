import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { DocMetadataRepo } from './doc-metadata.repo';
import {
  DOC_CLASSIFICATIONS,
  DocClassification,
  DocMetadata,
  DocMetadataRow,
} from './doc-metadata.types';
import {
  ListDocMetadataDto,
  UpdateDocMetadataDto,
} from './dto/doc-metadata.dto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

@Injectable()
export class DocMetadataService {
  constructor(
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private readonly repo: DocMetadataRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private async getPage(pageId: string, workspaceId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async canEdit(page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user, {
        ignoreLock: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async assertWorkspaceUser(userId: string, workspaceId: string) {
    const user = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!user) {
      throw new BadRequestException('Invalid user');
    }
  }

  private toDateOrNull(value: string | null): Date | null {
    if (value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return date;
  }

  private mapRow(row: DocMetadataRow, canEdit: boolean): DocMetadata {
    return {
      id: row.id,
      pageId: row.page_id,
      pageTitle: row.page_title,
      pageSlugId: row.page_slug_id,
      pageIcon: row.page_icon,
      spaceId: row.space_id,
      spaceName: row.space_name,
      spaceSlug: row.space_slug,
      ownerId: row.owner_id,
      owner: row.owner_user_id
        ? {
            id: row.owner_user_id,
            name: row.owner_name ?? '',
            avatarUrl: row.owner_avatar_url,
          }
        : null,
      reviewerId: row.reviewer_id,
      reviewer: row.reviewer_user_id
        ? {
            id: row.reviewer_user_id,
            name: row.reviewer_name ?? '',
            avatarUrl: row.reviewer_avatar_url,
          }
        : null,
      classification: (row.classification as DocClassification | null) ?? null,
      docType: row.doc_type,
      effectiveAt: row.effective_at?.toISOString() ?? null,
      reviewDueAt: row.review_due_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
      notes: row.notes,
      verificationStatus: row.verification_status,
      verificationExpiresAt: row.verification_expires_at?.toISOString() ?? null,
      canEdit,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async getInfo(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getPage(pageId, workspace.id);
    await this.pageAccessService.validateCanView(page, user);

    const canEdit = await this.canEdit(page, user);
    let row = await this.repo.findDetail(page.id);

    if (!row && canEdit) {
      await this.repo.ensure(
        page.id,
        page.workspaceId,
        page.spaceId,
        page.creatorId ?? null,
        user.id,
      );
      row = await this.repo.findDetail(page.id);
    }

    if (!row) {
      return {
        id: '',
        pageId: page.id,
        pageTitle: page.title,
        pageSlugId: page.slugId,
        pageIcon: page.icon,
        spaceId: page.spaceId,
        spaceName: '',
        spaceSlug: '',
        ownerId: page.creatorId ?? null,
        owner: null,
        reviewerId: null,
        reviewer: null,
        classification: null,
        docType: null,
        effectiveAt: null,
        reviewDueAt: null,
        archivedAt: null,
        notes: null,
        verificationStatus: null,
        verificationExpiresAt: null,
        canEdit,
        updatedAt: new Date().toISOString(),
      } satisfies DocMetadata;
    }

    return this.mapRow(row, canEdit);
  }

  async update(dto: UpdateDocMetadataDto, user: User, workspace: Workspace) {
    const page = await this.getPage(dto.pageId, workspace.id);
    await this.pageAccessService.validateCanEdit(page, user, {
      ignoreLock: true,
    });

    const before = await this.getInfo(page.id, user, workspace);

    if (dto.ownerId) {
      await this.assertWorkspaceUser(dto.ownerId, workspace.id);
    }
    if (dto.reviewerId) {
      await this.assertWorkspaceUser(dto.reviewerId, workspace.id);
    }
    if (
      dto.classification &&
      !DOC_CLASSIFICATIONS.includes(dto.classification as DocClassification)
    ) {
      throw new BadRequestException('Invalid classification');
    }

    await this.repo.ensure(
      page.id,
      page.workspaceId,
      page.spaceId,
      page.creatorId ?? null,
      user.id,
    );

    const patch: Record<string, unknown> = {
      updated_by_id: user.id,
    };

    if (dto.ownerId !== undefined) patch.owner_id = dto.ownerId || null;
    if (dto.reviewerId !== undefined) {
      patch.reviewer_id = dto.reviewerId || null;
    }
    if (dto.classification !== undefined) {
      patch.classification = dto.classification || null;
    }
    if (dto.docType !== undefined) {
      patch.doc_type = dto.docType?.trim() || null;
    }
    if (dto.effectiveAt !== undefined) {
      patch.effective_at = this.toDateOrNull(dto.effectiveAt);
    }
    if (dto.reviewDueAt !== undefined) {
      patch.review_due_at = this.toDateOrNull(dto.reviewDueAt);
    }
    if (dto.archivedAt !== undefined) {
      patch.archived_at = this.toDateOrNull(dto.archivedAt);
    }
    if (dto.notes !== undefined) patch.notes = dto.notes || null;

    await this.repo.update(page.id, patch);

    const changedFields = Object.keys(dto).filter(
      (key) => key !== 'pageId' && dto[key] !== undefined,
    );

    this.auditService.log({
      event: AuditEvent.DOC_METADATA_UPDATED,
      resourceType: AuditResource.DOC_METADATA,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        before: this.pickMetadataFields(before),
        after: {
          ...this.pickMetadataFields(before),
          ...Object.fromEntries(
            changedFields.map((key) => [
              key,
              dto[key] === '' ? null : dto[key],
            ]),
          ),
        },
      },
      metadata: { pageId: page.id, fields: changedFields },
    });

    return this.getInfo(page.id, user, workspace);
  }

  private pickMetadataFields(metadata: DocMetadata) {
    return {
      ownerId: metadata.ownerId,
      reviewerId: metadata.reviewerId,
      classification: metadata.classification,
      docType: metadata.docType,
      effectiveAt: metadata.effectiveAt,
      reviewDueAt: metadata.reviewDueAt,
      archivedAt: metadata.archivedAt,
      notes: metadata.notes,
    };
  }

  private async accessibleSpaceIds(user: User, requested?: string[]) {
    const accessible = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (!requested?.length) return accessible;
    const allowed = new Set(accessible);
    return requested.filter((id) => allowed.has(id));
  }

  async list(dto: ListDocMetadataDto, user: User, workspace: Workspace) {
    const spaceIds = await this.accessibleSpaceIds(user, dto.spaceIds);
    if (spaceIds.length === 0) {
      return { items: [], hasMore: false };
    }

    const limit = dto.limit ?? 50;
    const offset = dto.offset ?? 0;

    const rows = await this.repo.list({
      workspaceId: workspace.id,
      spaceIds,
      filter: dto.filter,
      classification: dto.classification,
      docType: dto.docType,
      query: dto.query,
      limit: limit + 1,
      offset,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const permissions =
      await this.pagePermissionRepo.filterAccessiblePageIdsWithPermissions(
        page.map((row) => row.page_id),
        user.id,
      );
    const permissionMap = new Map(
      permissions.map((permission) => [permission.id, permission.canEdit]),
    );

    return {
      items: page
        .filter((row) => permissionMap.has(row.page_id))
        .map((row) =>
          this.mapRow(row, permissionMap.get(row.page_id) ?? false),
        ),
      hasMore,
    };
  }

  async health(dto: { spaceIds?: string[] }, user: User, workspace: Workspace) {
    const spaceIds = await this.accessibleSpaceIds(user, dto.spaceIds);
    if (spaceIds.length === 0) {
      return {
        total: 0,
        missingOwner: 0,
        missingClassification: 0,
        reviewOverdue: 0,
        archived: 0,
        inReview: 0,
        orphan: 0,
        duplicateTitles: 0,
      };
    }

    return this.repo.health({
      workspaceId: workspace.id,
      spaceIds,
    });
  }
}
