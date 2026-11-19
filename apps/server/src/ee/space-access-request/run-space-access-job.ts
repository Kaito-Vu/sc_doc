import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { QueueJob } from '../../integrations/queue/constants';
import {
  SpaceAccessJob,
  SpaceAccessRequestNotification,
} from './space-access-request.notification';

const logger = new Logger('SpaceAccessRequestJob');

/** Entry point called by the core notification processor. */
export async function runSpaceAccessJob(
  moduleRef: ModuleRef,
  jobName: string,
  data: SpaceAccessJob,
): Promise<void> {
  const handler = moduleRef.get(SpaceAccessRequestNotification, {
    strict: false,
  });
  if (!handler) {
    logger.warn(`${jobName} fired but handler not resolvable`);
    return;
  }
  if (jobName === QueueJob.SPACE_ACCESS_REQUESTED) {
    await handler.processRequested(data);
  } else {
    await handler.processDecided(data);
  }
}
