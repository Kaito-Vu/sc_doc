import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EaImportService } from './ea-import.service';
import { EaImportController } from './ea-import.controller';
import { EaImportProcessor } from './ea-import.processor';
import { EaAttachmentService } from './ea-attachment.service';
import { EaHtmlReportService } from './ea-html-report.service';
import { ImportModule } from '../../integrations/import/import.module';
import { PageModule } from '../../core/page/page.module';
import { CaslModule } from '../../core/casl/casl.module';
import { EA_IMPORT_QUEUE } from './ea-import.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EA_IMPORT_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
    ImportModule,
    PageModule,
    CaslModule,
  ],
  providers: [
    EaImportService,
    EaAttachmentService,
    EaHtmlReportService,
    EaImportProcessor,
  ],
  controllers: [EaImportController],
})
export class EaImportModule {}
