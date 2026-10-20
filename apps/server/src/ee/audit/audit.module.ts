import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { AuditLogService } from './audit-log.service';
import { AuditQueryService } from './audit-query.service';
import { AuditQueryController } from './audit-query.controller';
import { AuditRequestInterceptor } from './audit-request.interceptor';
import { AuditRetentionService } from './audit-retention.service';

@Global()
@Module({
  providers: [
    AuditLogService,
    AuditQueryService,
    AuditRetentionService,
    {
      provide: AUDIT_SERVICE,
      useExisting: AuditLogService,
    },
    {
      // Guarantees every state-changing request is audited even when the
      // endpoint does not emit a dedicated domain event.
      provide: APP_INTERCEPTOR,
      useClass: AuditRequestInterceptor,
    },
  ],
  controllers: [AuditQueryController],
  exports: [AUDIT_SERVICE, AuditQueryService],
})
export class AuditEeModule {}
