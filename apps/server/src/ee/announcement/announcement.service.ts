import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { LicenseCheckService } from '../../integrations/environment/license-check.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditEventType, AuditResource } from '../../common/events/audit-events';
import { Feature } from '../../common/features';
import { AnnouncementRepo, AnnouncementRow } from './announcement.repo';
import { AnnouncementInputDto } from './dto/announcement.dto';
import {
  ANNOUNCEMENT_MAX_TEXT_LENGTH,
  ANNOUNCEMENT_MAX_VISIBLE,
  classifyOverlaps,
  deriveStatus,
  validateContent,
} from './announcement.utils';

export function toBanner(a: AnnouncementRow) {
  return {
    id: a.id,
    type: a.type,
    color: a.color,
    content: a.content,
    isDismissible: a.isDismissible,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
  };
}

export function toAnnouncement(a: AnnouncementRow, now = new Date()) {
  return {
    ...toBanner(a),
    title: a.title,
    audience: a.audience,
    archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
    status: deriveStatus(a, now),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly repo: AnnouncementRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly licenseCheckService: LicenseCheckService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getVisible(workspaceId: string) {
    return this.visible(workspaceId, false);
  }

  /** Unauthenticated surface: only 'everyone' announcements, and only if the feature is on. */
  async getPublic(workspaceId?: string) {
    const now = new Date();
    if (!workspaceId) return { now: now.toISOString(), items: [] };
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (
      !workspace ||
      !this.licenseCheckService.hasFeature(
        workspace.licenseKey ?? '',
        Feature.ANNOUNCEMENTS,
        workspace.plan,
      )
    ) {
      return { now: now.toISOString(), items: [] };
    }
    return this.visible(workspaceId, true);
  }

  private async visible(workspaceId: string, publicOnly: boolean) {
    const now = new Date();
    const rows = await this.repo.findVisible(
      workspaceId,
      now,
      ANNOUNCEMENT_MAX_VISIBLE,
      publicOnly,
    );
    return { now: now.toISOString(), items: rows.map(toBanner) };
  }

  async list(workspaceId: string, dto: PaginationOptions & { status?: any }) {
    const now = new Date();
    const result = await this.repo.list(
      workspaceId,
      dto.status ?? 'active',
      now,
      dto,
    );
    return {
      ...result,
      items: result.items.map((row) => toAnnouncement(row, now)),
    };
  }

  async create(workspaceId: string, userId: string, dto: AnnouncementInputDto) {
    const now = new Date();
    const fields = this.buildFields(dto);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : now;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.assertWindow(startsAt, endsAt, now, true);

    const created = await executeTx(this.db, async (trx) => {
      const adjusted = await this.resolveOverlaps(
        workspaceId,
        { startsAt, endsAt },
        now,
        null,
        !!dto.replace,
        userId,
        trx,
      );
      return this.repo.insert(
        {
          ...fields,
          workspaceId,
          startsAt,
          endsAt: adjusted,
          creatorId: userId,
          lastUpdatedById: userId,
        },
        trx,
      );
    });

    this.audit(AuditEvent.ANNOUNCEMENT_CREATED, created);
    return toAnnouncement(created, now);
  }

  async update(
    workspaceId: string,
    userId: string,
    announcementId: string,
    dto: AnnouncementInputDto,
  ) {
    const now = new Date();
    const fields = this.buildFields(dto);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : now;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    const updated = await executeTx(this.db, async (trx) => {
      const existing = await this.repo.findById(
        announcementId,
        workspaceId,
        trx,
      );
      if (!existing) throw new NotFoundException('Announcement not found');

      // an end left as stored may already have passed; a changed one must be in the future
      const endChanged = endsAt?.getTime() !== existing.endsAt?.getTime();
      this.assertWindow(startsAt, endsAt, now, endChanged);

      // archived or already ended announcements do not take part in the one-at-a-time rule
      const live = !existing.archivedAt && (!endsAt || endsAt > now);
      const adjusted = live
        ? await this.resolveOverlaps(
            workspaceId,
            { startsAt, endsAt },
            now,
            announcementId,
            !!dto.replace,
            userId,
            trx,
          )
        : endsAt;

      return this.repo.update(
        announcementId,
        workspaceId,
        { ...fields, startsAt, endsAt: adjusted, lastUpdatedById: userId },
        trx,
      );
    });

    this.audit(AuditEvent.ANNOUNCEMENT_UPDATED, updated);
    return toAnnouncement(updated, now);
  }

  async archive(workspaceId: string, userId: string, announcementId: string) {
    const existing = await this.get(workspaceId, announcementId);
    const now = new Date();
    const row = existing.archivedAt
      ? existing
      : await this.repo.update(announcementId, workspaceId, {
          archivedAt: now,
          lastUpdatedById: userId,
        });
    if (!existing.archivedAt) this.audit(AuditEvent.ANNOUNCEMENT_ARCHIVED, row);
    return toAnnouncement(row, now);
  }

  async unarchive(workspaceId: string, userId: string, announcementId: string) {
    const now = new Date();
    const row = await executeTx(this.db, async (trx) => {
      const existing = await this.repo.findById(
        announcementId,
        workspaceId,
        trx,
      );
      if (!existing) throw new NotFoundException('Announcement not found');
      if (existing.endsAt && existing.endsAt <= now) {
        throw new BadRequestException(
          'This announcement has ended. Set a later end time before restoring it.',
        );
      }
      const clashes = await this.repo.findOverlapping(
        workspaceId,
        existing,
        now,
        announcementId,
        trx,
      );
      if (clashes.length) {
        throw new ConflictException({
          message: 'Only one announcement can show at a time',
          conflict: {
            from: existing.startsAt.toISOString(),
            to: existing.endsAt ? existing.endsAt.toISOString() : null,
            announcements: clashes.map((c) => ({ id: c.id, title: c.title })),
          },
        });
      }
      return this.repo.update(
        announcementId,
        workspaceId,
        { archivedAt: null, lastUpdatedById: userId },
        trx,
      );
    });
    this.audit(AuditEvent.ANNOUNCEMENT_UNARCHIVED, row);
    return toAnnouncement(row, now);
  }

  async delete(workspaceId: string, announcementId: string) {
    const existing = await this.get(workspaceId, announcementId);
    await this.repo.delete(announcementId, workspaceId);
    this.audit(AuditEvent.ANNOUNCEMENT_DELETED, existing);
  }

  private async get(workspaceId: string, id: string) {
    const row = await this.repo.findById(id, workspaceId);
    if (!row) throw new NotFoundException('Announcement not found');
    return row;
  }

  private buildFields(dto: AnnouncementInputDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    const textContent = validateContent(dto.content);
    if (!textContent.trim()) {
      throw new BadRequestException('Announcement message is required');
    }
    if (textContent.length > ANNOUNCEMENT_MAX_TEXT_LENGTH) {
      throw new BadRequestException('Announcement message is too long');
    }
    return {
      title,
      textContent,
      content: dto.content,
      type: dto.type,
      color: dto.color,
      audience: dto.audience,
      isDismissible: dto.isDismissible,
    };
  }

  private assertWindow(
    startsAt: Date,
    endsAt: Date | null,
    now: Date,
    checkFuture: boolean,
  ) {
    if (endsAt && checkFuture && endsAt <= now) {
      throw new BadRequestException('End time must be in the future');
    }
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('End time must be after the start time');
    }
  }

  /**
   * Enforces ANNOUNCEMENT_MAX_VISIBLE = 1 over time. Without `replace` an
   * overlap answers 409 {replaces, replacedBy}; with it, earlier announcements
   * are ended when the candidate starts, and the candidate's end is pulled back
   * to the next one's start. Returns the candidate's (possibly shortened) end.
   * ponytail: no advisory lock, concurrent admin saves could still overlap.
   */
  private async resolveOverlaps(
    workspaceId: string,
    window: { startsAt: Date; endsAt: Date | null },
    now: Date,
    excludeId: string | null,
    replace: boolean,
    userId: string,
    trx: any,
  ): Promise<Date | null> {
    const others = await this.repo.findOverlapping(
      workspaceId,
      window,
      now,
      excludeId,
      trx,
    );
    if (!others.length) return window.endsAt;

    const { replaces, replacedBy, clashes } = classifyOverlaps(window, others);
    if (clashes.length) {
      throw new ConflictException({
        message: 'Only one announcement can show at a time',
        conflict: {
          from: window.startsAt.toISOString(),
          to: window.endsAt ? window.endsAt.toISOString() : null,
          announcements: clashes,
        },
      });
    }
    if (!replace) {
      throw new ConflictException({
        message: 'This replaces another announcement',
        replaces,
        replacedBy,
      });
    }
    for (const r of replaces) {
      await this.repo.update(
        r.id,
        workspaceId,
        { endsAt: window.startsAt, lastUpdatedById: userId },
        trx,
      );
    }
    return replacedBy.length ? new Date(replacedBy[0].at) : window.endsAt;
  }

  private audit(event: AuditEventType, row: AnnouncementRow) {
    this.auditService.log({
      event,
      resourceType: AuditResource.ANNOUNCEMENT,
      resourceId: row.id,
      metadata: { title: row.title },
    });
  }
}
