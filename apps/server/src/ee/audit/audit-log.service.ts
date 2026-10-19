import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'net';
import { InjectKysely } from 'nestjs-kysely';
import { ClsService } from 'nestjs-cls';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditLogPayload } from '../../common/events/audit-events';
import { EXCLUDED_AUDIT_EVENTS } from '../../common/events/audit-events';
import { sql } from 'kysely';
import { AuditQueryService } from './audit-query.service';

@Injectable()
export class AuditLogService implements IAuditService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly cls: ClsService,
    private readonly auditQueryService: AuditQueryService,
  ) {}

  log(payload: AuditLogPayload): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (!context?.workspaceId) return;
    if (EXCLUDED_AUDIT_EVENTS.has(payload.event)) return;

    this.insertLogs([payload], {
      workspaceId: context.workspaceId,
      actorId: context.actorId ?? undefined,
      actorType: context.actorType,
      ipAddress: context.ipAddress ?? undefined,
      userAgent: context.userAgent ?? undefined,
    });
  }

  logWithContext(payload: AuditLogPayload, context: AuditLogContext): void {
    if (EXCLUDED_AUDIT_EVENTS.has(payload.event)) return;
    this.insertLogs([payload], context);
  }

  logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): void {
    this.insertLogs(
      payloads.filter((p) => !EXCLUDED_AUDIT_EVENTS.has(p.event)),
      context,
    );
  }

  setActorId(actorId: string): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (context) {
      context.actorId = actorId;
      this.cls.set(AUDIT_CONTEXT_KEY, context);
    }
  }

  setActorType(actorType: AuditContext['actorType']): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (context) {
      context.actorType = actorType;
      this.cls.set(AUDIT_CONTEXT_KEY, context);
    }
  }

  async updateRetention(
    workspaceId: string,
    retentionDays: number,
  ): Promise<void> {
    await this.auditQueryService.updateRetention(workspaceId, retentionDays);
  }

  /**
   * Fire-and-forget, one INSERT for the whole batch. Failures are logged, never
   * thrown: callers don't await, so a rejection would be unhandled.
   */
  private insertLogs(payloads: AuditLogPayload[], context: AuditLogContext) {
    if (payloads.length === 0) return;
    // A non-IP value (proxy junk, "unknown") would fail the ::inet cast and
    // drop the whole row.
    const ipAddress =
      context.ipAddress && isIP(context.ipAddress)
        ? sql<string>`${context.ipAddress}::inet`
        : null;
    this.db
      .insertInto('audit')
      .values(
        payloads.map((payload) => ({
          workspaceId: context.workspaceId,
          actorId: context.actorId ?? null,
          actorType: context.actorType ?? 'user',
          event: payload.event,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId ?? null,
          spaceId: payload.spaceId ?? null,
          changes: payload.changes ?? null,
          metadata: payload.metadata ?? null,
          ipAddress,
          userAgent: context.userAgent ?? null,
        })),
      )
      .execute()
      .catch((err) =>
        this.logger.error(
          `Failed to write ${payloads.length} audit log(s): ${err?.message}`,
        ),
      );
  }
}
