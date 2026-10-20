import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { MIN_AUDIT_RETENTION_DAYS } from './dto/audit-query.dto';

// Arbitrary constant key for the session-level advisory lock (single runner).
const PURGE_LOCK_KEY = 726150001;
const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_WORKSPACE = 200;

/**
 * Enforces each workspace's audit retention window. Runs daily and deletes in
 * small batches so a large purge never holds a long lock on the audit table.
 */
@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredLogs(): Promise<void> {
    // Session-level lock on one dedicated connection: only one instance purges.
    await this.db.connection().execute(async (conn) => {
      const { rows } = await sql<{ locked: boolean }>`
        select pg_try_advisory_lock(${PURGE_LOCK_KEY}::bigint) as locked
      `.execute(conn);
      if (!rows[0]?.locked) {
        this.logger.debug('Audit retention purge already running elsewhere');
        return;
      }
      try {
        await this.purgeAll();
      } finally {
        await sql`select pg_advisory_unlock(${PURGE_LOCK_KEY}::bigint)`.execute(
          conn,
        );
      }
    });
  }

  private async purgeAll(): Promise<void> {
    try {
      const workspaces = await this.db
        .selectFrom('workspaces')
        .select(['id', 'auditRetentionDays'])
        .execute();

      for (const workspace of workspaces) {
        // Mirrors AuditQueryService.getRetention: unset means the 90-day default.
        const retentionDays = Math.max(
          Number(workspace.auditRetentionDays ?? 90) || 0,
          MIN_AUDIT_RETENTION_DAYS,
        );

        const cutoff = new Date(
          Date.now() - retentionDays * 24 * 60 * 60 * 1000,
        );
        const deleted = await this.purgeWorkspace(workspace.id, cutoff);
        if (deleted > 0) {
          this.logger.log(
            `Purged ${deleted} audit log(s) older than ${retentionDays} day(s) for workspace ${workspace.id}`,
          );
          await this.auditService.logWithContext(
            {
              event: AuditEvent.AUDIT_PURGED,
              resourceType: AuditResource.AUDIT_LOG,
              resourceId: workspace.id,
              metadata: {
                deletedCount: deleted,
                retentionDays,
                cutoff: cutoff.toISOString(),
              },
            },
            { workspaceId: workspace.id, actorType: 'system' },
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`Audit retention purge failed: ${error?.message}`);
    }
  }

  private async purgeWorkspace(
    workspaceId: string,
    cutoff: Date,
  ): Promise<number> {
    let total = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_WORKSPACE; batch++) {
      const rows = await this.db
        .selectFrom('audit')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('createdAt', '<', cutoff)
        .limit(BATCH_SIZE)
        .execute();

      if (rows.length === 0) break;

      await this.db
        .deleteFrom('audit')
        .where(
          'id',
          'in',
          rows.map((row) => row.id),
        )
        .execute();

      total += rows.length;

      if (rows.length < BATCH_SIZE) break;
    }

    return total;
  }
}
