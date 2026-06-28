import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';
import { MinioSettingsRepository } from '../repositories/minio-settings.repository';

export enum MinioQueueJob {
  GC_HARD_DELETE = 'minio:gc-hard-delete',
  GC_VERSION_CLEANUP = 'minio:gc-version-cleanup',
  RECONCILE = 'minio:reconcile',
}

@Processor('minio-queue')
export class MinioGarbageCollectorProcessor extends WorkerHost {
  private readonly logger = new Logger(MinioGarbageCollectorProcessor.name);

  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly settingsRepo: MinioSettingsRepository,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    switch (job.name) {
      case MinioQueueJob.GC_HARD_DELETE:
        await this.runHardDelete(job.data.workspaceId);
        break;
      case MinioQueueJob.GC_VERSION_CLEANUP:
        await this.runVersionCleanup(job.data.workspaceId);
        break;
      case MinioQueueJob.RECONCILE:
        await this.runReconciliation(job.data.workspaceId);
        break;
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async runHardDelete(workspaceId: string): Promise<void> {
    try {
      this.logger.debug(`Running hard delete GC for workspace ${workspaceId}`);
      await this.attachmentService.hardDeleteOldAttachments(workspaceId);
      this.logger.log(`Hard delete GC completed for workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(`Hard delete GC failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async runVersionCleanup(workspaceId: string): Promise<void> {
    try {
      this.logger.debug(`Running version cleanup for workspace ${workspaceId}`);
      // Version cleanup is handled by MinIO lifecycle policy
      // This job can be extended for custom cleanup logic
      this.logger.log(`Version cleanup completed for workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(`Version cleanup failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async runReconciliation(workspaceId: string): Promise<void> {
    try {
      this.logger.debug(`Running reconciliation for workspace ${workspaceId}`);
      await this.attachmentService.reconcile(workspaceId);
      this.logger.log(`Reconciliation completed for workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(`Reconciliation failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing job ${job.id} (${job.name})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Completed job ${job.id} (${job.name})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} (${job.name}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
