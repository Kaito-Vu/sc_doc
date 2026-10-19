import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PageVerificationRepo } from './page-verification.repo';
import {
  QueueJob,
  QueueName,
} from '../../integrations/queue/constants';
import { EXPIRING_WARNING_MS } from './page-verification.status';

@Injectable()
export class PageVerificationSchedulerService {
  private readonly logger = new Logger(PageVerificationSchedulerService.name);

  constructor(
    private readonly pageVerificationRepo: PageVerificationRepo,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async reconcile(): Promise<void> {
    const now = new Date();
    const warningBefore = new Date(now.getTime() + EXPIRING_WARNING_MS);

    const [expiring, expired] = await Promise.all([
      this.pageVerificationRepo.findExpiringVerifications(now, warningBefore),
      this.pageVerificationRepo.findExpiredVerifications(now),
    ]);

    // one round trip instead of one per verification
    const jobs = [
      ...expiring.map((verification) => ({
        name: QueueJob.PAGE_VERIFICATION_EXPIRING,
        data: { verificationId: verification.id },
      })),
      ...expired.map((verification) => ({
        name: QueueJob.PAGE_VERIFICATION_EXPIRED,
        data: { verificationId: verification.id },
      })),
    ];
    if (jobs.length > 0) {
      await this.notificationQueue.addBulk(jobs);
    }

    this.logger.debug(
      `Verification reconcile: ${expiring.length} expiring, ${expired.length} expired`,
    );
  }
}
