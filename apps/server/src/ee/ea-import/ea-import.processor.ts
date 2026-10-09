import { OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EaImportService } from './ea-import.service';
import { EA_IMPORT_JOB, EA_IMPORT_QUEUE } from './ea-import.constants';

@Processor(EA_IMPORT_QUEUE)
export class EaImportProcessor extends WorkerHost implements OnModuleDestroy {
  constructor(private readonly eaImportService: EaImportService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === EA_IMPORT_JOB) {
      await this.eaImportService.processEaImportTask(
        job.data.fileTaskId,
        job.data.mode,
      );
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job): Promise<void> {
    await this.eaImportService.markTaskFailed(
      job.data?.fileTaskId,
      job.failedReason,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
