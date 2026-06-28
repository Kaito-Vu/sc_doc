import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AttachmentController } from './controllers/attachment.controller';
import { AttachmentService } from './services/attachment.service';
import { MinioSettingsService } from './services/minio-settings.service';
import { MinioClientService } from './services/minio-client.service';
import { AttachmentRepository } from './repositories/attachment.repository';
import { MinioSettingsRepository } from './repositories/minio-settings.repository';
import { MinioGarbageCollectorProcessor } from './jobs/gc.processor';
import { MinioPageHooksHandler } from './hooks/page-hooks';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'minio-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 20000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    }),
  ],
  controllers: [AttachmentController],
  providers: [
    AttachmentService,
    MinioSettingsService,
    MinioClientService,
    AttachmentRepository,
    MinioSettingsRepository,
    MinioGarbageCollectorProcessor,
    MinioPageHooksHandler,
  ],
  exports: [AttachmentService, MinioSettingsService, MinioClientService],
})
export class MinioModule implements OnModuleInit {
  private logger = new Logger(MinioModule.name);

  constructor(private pageHooksHandler: MinioPageHooksHandler) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing MinIO plugin module');

    try {
      // Register hooks
      this.pageHooksHandler.registerHooks();
      this.logger.log('MinIO plugin hooks registered');
    } catch (error) {
      const errorMsg = error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error);
      this.logger.error(`Failed to initialize MinIO plugin: ${errorMsg}`);
      // Don't throw to prevent module init failure
    }
  }
}
