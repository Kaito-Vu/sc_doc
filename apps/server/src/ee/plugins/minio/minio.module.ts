import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AttachmentController } from './controllers/attachment.controller';
import { MinioSettingsController } from './controllers/settings.controller';
import { AttachmentService } from './services/attachment.service';
import { MinioSettingsService } from './services/minio-settings.service';
import { MinioClientService } from './services/minio-client.service';
import { MinioEncryptionService } from './services/minio-encryption.service';
import { MinioMigrationService } from './services/minio-migration.service';
import { AttachmentRepository } from './repositories/attachment.repository';
import { MinioSettingsRepository } from './repositories/minio-settings.repository';
import { MinioGarbageCollectorProcessor } from './jobs/gc.processor';
import { MinioMigrationProcessor } from './jobs/migration.processor';
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
  controllers: [AttachmentController, MinioSettingsController],
  providers: [
    AttachmentService,
    MinioSettingsService,
    MinioClientService,
    MinioEncryptionService,
    MinioMigrationService,
    AttachmentRepository,
    MinioSettingsRepository,
    MinioGarbageCollectorProcessor,
    MinioMigrationProcessor,
    MinioPageHooksHandler,
  ],
  exports: [
    AttachmentService,
    MinioSettingsService,
    MinioClientService,
    MinioEncryptionService,
    MinioMigrationService,
  ],
})
export class MinioModule implements OnModuleInit {
  private readonly logger = new Logger(MinioModule.name);

  constructor(private readonly pageHooksHandler: MinioPageHooksHandler) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing MinIO plugin module');

    try {
      // Register hooks
      this.pageHooksHandler.registerHooks();
      this.logger.log('MinIO plugin hooks registered');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize MinIO plugin: ${errorMsg}`);
      // Don't throw to prevent module init failure
    }
  }
}
