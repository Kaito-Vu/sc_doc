import { OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DocxExportJobService } from './docx-export-job.service';
import {
  DOCX_EXPORT_CONCURRENCY,
  DOCX_EXPORT_JOB,
  DOCX_EXPORT_QUEUE,
  DocxExportJobData,
  DocxExportResult,
} from './docx-export.constants';

@Processor(DOCX_EXPORT_QUEUE, { concurrency: DOCX_EXPORT_CONCURRENCY })
export class DocxExportProcessor extends WorkerHost implements OnModuleDestroy {
  constructor(private readonly jobs: DocxExportJobService) {
    super();
  }

  async process(job: Job<DocxExportJobData>): Promise<DocxExportResult> {
    if (job.name === DOCX_EXPORT_JOB) return this.jobs.run(job.data);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.worker.close();
  }
}
