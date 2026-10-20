import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import {
  ActorType,
  AuditEvent,
  AuditResource,
  AuditResourceType,
} from '../../common/events/audit-events';
import { AuditLogService } from './audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// POST is also used for read-only endpoints in this API. These paths never
// represent a user action, so the generic fallback must not record them.
// Mutating routes that share a segment (e.g. /members/add) always emit a
// dedicated domain event, which suppresses this fallback anyway.
const READ_ONLY_PATH =
  /\/(info|list|query|search|preview|stats|statistics|facets|detail|check|validate|retention|health|available|connections|unfurl|recent|trash|backlinks|breadcrumbs|transclusion|lookup|references|ids|members|invites|entitlements|providers|status|payload|count|permissions|verifications|tree|directory|page-info|for-page|for-space|lock-info|permission-info|verification-info|expand|token|me|version|public|created-by-user|history)(\/|$)/i;

// Exact collection endpoints whose "read" meaning would otherwise be
// swallowed by the slash-suffixed action routes (/rows/create, ...).
const READ_ONLY_EXACT = /\/(rows|ids)$/i;

const SKIPPED_PREFIXES = [
  '/api/audit',
  '/api/client-logs',
  '/api/health',
  '/api/ws',
  '/api/collab',
];

const SENSITIVE_KEY =
  /(password|passwd|secret|token|authorization|cookie|api[-_]?key|credential|otp|mfa|recovery|private|signature|^code$)/i;

// Document/comment bodies must never be copied into the audit trail: audit
// viewers are admins who may not have access to restricted pages.
const CONTENT_KEY =
  /^(content|text|textContent|html|markdown|ydoc|operations|body|description|message)$/i;

// Client errors caused by malformed input are noise and let any user inflate
// the table; denials (401/403), conflicts and server errors are kept.
const IGNORED_ERROR_STATUSES = new Set([400, 404, 413, 422]);

const MAX_METADATA_BYTES = 4096;

const ID_KEYS = [
  'id',
  'pageId',
  'spaceId',
  'commentId',
  'groupId',
  'userId',
  'templateId',
  'attachmentId',
  'sessionId',
  'shareId',
  'resourceId',
  'apiKeyId',
  'destinationId',
  'historyId',
];

const RESOURCE_HINTS: [RegExp, AuditResourceType][] = [
  [
    /\/(workspace|workspaces)(\/|$)/i,
    AuditResource.WORKSPACE as AuditResourceType,
  ],
  [
    /\/(personal-space)(\/|$)/i,
    AuditResource.PERSONAL_SPACE as AuditResourceType,
  ],
  [/\/(pages?|history)(\/|$)/i, AuditResource.PAGE as AuditResourceType],
  [/\/(spaces?)(\/|$)/i, AuditResource.SPACE as AuditResourceType],
  [/\/(comments?)(\/|$)/i, AuditResource.COMMENT as AuditResourceType],
  [/\/(groups?)(\/|$)/i, AuditResource.GROUP as AuditResourceType],
  [/\/(users?)(\/|$)/i, AuditResource.USER as AuditResourceType],
  [/\/(api-keys?)(\/|$)/i, AuditResource.API_KEY as AuditResourceType],
  [/\/(templates?)(\/|$)/i, AuditResource.TEMPLATE as AuditResourceType],
  [/\/(sessions?)(\/|$)/i, AuditResource.SESSION as AuditResourceType],
  [/\/(attachments?)(\/|$)/i, AuditResource.ATTACHMENT as AuditResourceType],
  [/\/(shares?)(\/|$)/i, AuditResource.SHARE as AuditResourceType],
  [/\/(labels?)(\/|$)/i, AuditResource.LABEL as AuditResourceType],
  [/\/(bases?)(\/|$)/i, AuditResource.BASE as AuditResourceType],
  [/\/metadata(\/|$)/i, AuditResource.DOC_METADATA as AuditResourceType],
  [/\/(sso|scim)(\/|$)/i, AuditResource.SSO_PROVIDER as AuditResourceType],
  [/\/(integrations?)(\/|$)/i, AuditResource.INTEGRATION as AuditResourceType],
  [/\/(license|licence)(\/|$)/i, AuditResource.LICENSE as AuditResourceType],
];

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 40)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? '[redacted]'
        : CONTENT_KEY.test(key)
          ? '[omitted]'
          : sanitize(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function findId(
  sources: (Record<string, unknown> | undefined)[],
): string | undefined {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of ID_KEYS) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return undefined;
}

function detectResourceType(path: string): AuditResourceType {
  for (const [pattern, resource] of RESOURCE_HINTS) {
    if (pattern.test(path)) return resource;
  }
  return AuditResource.API_REQUEST as AuditResourceType;
}

@Injectable()
export class AuditRequestInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService,
    private readonly auditService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = String(request.method ?? '').toUpperCase();
    const path = String(request.url ?? '').split('?')[0];

    if (!MUTATING_METHODS.has(method)) return next.handle();
    if (SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next.handle();
    }
    if (READ_ONLY_PATH.test(path)) return next.handle();
    if (READ_ONLY_EXACT.test(path)) return next.handle();
    // Collection/info routes mounted as POST often end with a slash.
    if (path.endsWith('/')) return next.handle();

    this.applyActorType(request);

    const startedAt = Date.now();
    let statusCode = 200;
    let errorMessage: string | undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          statusCode = context.switchToHttp().getResponse()?.statusCode ?? 200;
          this.write(request, method, path, statusCode, startedAt);
        },
        error: (error: any) => {
          statusCode =
            error?.status ?? error?.statusCode ?? error?.getStatus?.() ?? 500;
          errorMessage = error?.message ?? String(error);
          if (IGNORED_ERROR_STATUSES.has(statusCode)) return;
          this.write(
            request,
            method,
            path,
            statusCode,
            startedAt,
            errorMessage,
          );
        },
      }),
    );
  }

  private applyActorType(request: any): void {
    const auditContext = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    if (!auditContext) return;

    const authType = request.user?.authType;
    if (authType === 'api_key' || authType === 'oauth_access') {
      auditContext.actorType =
        authType === 'api_key'
          ? ('api_key' as ActorType)
          : ('oauth' as ActorType);
      const actorId = request.user?.user?.id ?? request.user?.id;
      if (actorId) auditContext.actorId = actorId;
      this.cls.set(AUDIT_CONTEXT_KEY, auditContext);
    }
  }

  private write(
    request: any,
    method: string,
    path: string,
    statusCode: number,
    startedAt: number,
    errorMessage?: string,
  ): void {
    // A dedicated domain event already describes this action in more detail.
    if (this.auditService.hasLoggedInRequest()) return;

    const auditContext = this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    // Unauthenticated endpoints (login, forgot-password, ...) have dedicated
    // domain events; recording them here would let anyone flood the table.
    const actorId =
      auditContext?.actorId ??
      request.user?.user?.id ??
      request.user?.id ??
      undefined;
    if (!actorId) return;

    const workspaceId =
      auditContext?.workspaceId ??
      request.workspaceId ??
      request.raw?.workspaceId ??
      request.user?.workspace?.id;

    if (!workspaceId) return;

    const params = (request.params ?? {}) as Record<string, unknown>;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const contentType = String(request.headers?.['content-type'] ?? '');
    const body =
      request.body &&
      typeof request.body === 'object' &&
      !Buffer.isBuffer(request.body) &&
      !contentType.includes('multipart/form-data')
        ? (request.body as Record<string, unknown>)
        : undefined;

    const resourceType = detectResourceType(path);
    const resourceId = findId([params, body, query]);
    const spaceId =
      typeof body?.spaceId === 'string'
        ? body.spaceId
        : typeof query.spaceId === 'string'
          ? query.spaceId
          : undefined;

    const metadata: Record<string, unknown> = {
      method,
      path,
      statusCode,
      durationMs: Date.now() - startedAt,
    };

    const sanitizedParams = sanitize(params);
    const sanitizedQuery = sanitize(query);
    const sanitizedBody = sanitize(body);

    if (Object.keys(params).length > 0) metadata.params = sanitizedParams;
    if (Object.keys(query).length > 0) metadata.query = sanitizedQuery;
    if (body && Object.keys(body).length > 0) metadata.body = sanitizedBody;
    if (errorMessage) metadata.error = errorMessage;

    // Bound row size: drop the free-form parts first, keep the essentials.
    if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
      delete metadata.body;
      delete metadata.query;
    }

    this.auditService.logWithContext(
      {
        event: AuditEvent.API_REQUEST,
        resourceType,
        resourceId,
        spaceId,
        metadata,
      },
      {
        workspaceId,
        actorId,
        actorType: auditContext?.actorType ?? 'user',
        ipAddress: auditContext?.ipAddress ?? request.ip ?? undefined,
        userAgent:
          auditContext?.userAgent ??
          request.headers?.['user-agent'] ??
          undefined,
      },
    );
  }
}
