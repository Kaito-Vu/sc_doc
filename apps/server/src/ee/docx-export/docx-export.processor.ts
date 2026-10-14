import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DocxExportJobService } from './docx-export-job.service';
import {
  DOCX_EXPORT_CONCURRENCY,
  DOCX_EXPORT_QUEUE,
  DocxExportJobData,
  DocxExportResult,
} from './docx-export.constants';

@Processor(DOCX_EXPORT_QUEUE, { concurrency: DOCX_EXPORT_CONCURRENCY })
export class DocxExportProcessor extends WorkerHost {
  constructor(private readonly jobs: DocxExportJobService) {
    super();
  }

  async process(job: Job<DocxExportJobData>): Promise<DocxExportResult> {
    return this.jobs.run(job.data);
  }
}
