import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationModule } from '../../core/notification/notification.module';
import { DocxExportJobService } from './docx-export-job.service';
import { DocxExportProcessor } from './docx-export.processor';
import { DOCX_EXPORT_QUEUE } from './docx-export.constants';
import { DocxExportService } from './docx-export.service';
import { SvgRasterizerService } from './svg-rasterizer.service';
import { DiagramCacheCleanupService } from './diagram-cache-cleanup.service';
import { DocxExportController } from './docx-export.controller';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';

@Module({
  imports: [
    PageAccessModule,
    NotificationModule,
    BullModule.registerQueue({ name: DOCX_EXPORT_QUEUE }),
  ],
  providers: [
    DocxExportService,
    SvgRasterizerService,
    DiagramCacheCleanupService,
    DocxExportJobService,
    DocxExportProcessor,
  ],
  controllers: [DocxExportController],
})
export class DocxExportModule {}
