import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'net';
import { InjectKysely } from 'nestjs-kysely';
import { ClsService } from 'nestjs-cls';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AUDIT_CONTEXT_KEY,
  AUDIT_LOGGED_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditLogPayload,
  EXCLUDED_AUDIT_EVENTS,
} from '../../common/events/audit-events';
import { sql } from 'kysely';
import { AuditQueryService } from './audit-query.service';

// Chatty events (title edits fire on every debounce) are recorded at most once
// per actor/resource within this window, per instance.
const COALESCED_EVENTS = new Set<string>([AuditEvent.PAGE_UPDATED]);
const COALESCE_WINDOW_MS = 60_000;

@Injectable()
export class AuditLogService implements IAuditService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly recentlyLogged = new Map<string, number>();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly cls: ClsService,
    private readonly auditQueryService: AuditQueryService,
  ) {}

  log(payload: AuditLogPayload): void {
    const context = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (!context?.workspaceId) return;
    if (EXCLUDED_AUDIT_EVENTS.has(payload.event)) return;

    this.markLogged();
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
    this.markLogged();
    this.insertLogs([payload], context);
  }

  logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): void {
    const accepted = payloads.filter(
      (p) => !EXCLUDED_AUDIT_EVENTS.has(p.event),
    );
    if (accepted.length === 0) return;
    this.markLogged();
    this.insertLogs(accepted, context);
  }

  /**
   * True when the current request already produced at least one domain audit
   * event. Used by AuditRequestInterceptor to avoid duplicate fallback rows.
   */
  hasLoggedInRequest(): boolean {
    return this.cls.get<boolean>(AUDIT_LOGGED_KEY) === true;
  }

  private markLogged(): void {
    try {
      this.cls.set(AUDIT_LOGGED_KEY, true);
    } catch {
      // No active CLS context (background job/queue): nothing to dedupe.
    }
  }

  private isCoalesced(
    payload: AuditLogPayload,
    context: AuditLogContext,
  ): boolean {
    if (!COALESCED_EVENTS.has(payload.event)) return false;

    const now = Date.now();
    const key = `${context.actorId}|${payload.event}|${payload.resourceId}`;
    const last = this.recentlyLogged.get(key);
    if (last !== undefined && now - last < COALESCE_WINDOW_MS) return true;

    this.recentlyLogged.set(key, now);
    if (this.recentlyLogged.size > 5000) {
      for (const [k, t] of this.recentlyLogged) {
        if (now - t >= COALESCE_WINDOW_MS) this.recentlyLogged.delete(k);
      }
    }
    return false;
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
  private insertLogs(
    allPayloads: AuditLogPayload[],
    context: AuditLogContext,
  ) {
    const payloads = allPayloads.filter((p) => !this.isCoalesced(p, context));
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
