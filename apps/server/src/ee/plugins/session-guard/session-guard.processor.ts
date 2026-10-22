import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  SESSION_GUARD_JOB_EXPIRE,
  SESSION_GUARD_QUEUE,
} from './session-guard.constants';
import { SessionGuardService } from './session-guard.service';

@Processor(SESSION_GUARD_QUEUE)
export class SessionGuardProcessor extends WorkerHost {
  constructor(private readonly sessionGuardService: SessionGuardService) {
    super();
  }

  async process(job: Job<{ conflictId: string }>): Promise<void> {
    if (job.name !== SESSION_GUARD_JOB_EXPIRE) return;

    await this.sessionGuardService.expireConflict(job.data.conflictId);
  }
}
