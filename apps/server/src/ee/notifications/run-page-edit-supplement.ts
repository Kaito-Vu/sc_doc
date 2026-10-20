import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { IPageEditSupplementJob } from '../../integrations/queue/constants/queue.interface';
import { PageEditSupplementService } from './page-edit-supplement.service';

const logger = new Logger('PageEditSupplement');

/** Entry point called by the core notification processor. */
export async function runPageEditSupplement(
  moduleRef: ModuleRef,
  data: IPageEditSupplementJob,
  appUrl: string,
): Promise<void> {
  const service = moduleRef.get(PageEditSupplementService, { strict: false });
  if (!service) {
    logger.warn('PAGE_EDIT_SUPPLEMENT fired but service not resolvable');
    return;
  }
  await service.process(data, appUrl);
}
