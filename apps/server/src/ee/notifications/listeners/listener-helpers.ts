import { Logger } from '@nestjs/common';
import { DomainService } from '../../../integrations/environment/domain.service';
import { NotificationRecipientsRepo } from '../notification-recipients.repo';

export async function safeHandle(
  logger: Logger,
  eventName: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Failed to process ${eventName} notification: ${message}`);
  }
}

export async function workspaceUrl(
  recipientsRepo: NotificationRecipientsRepo,
  domainService: DomainService,
  workspaceId: string,
): Promise<string> {
  const hostname = await recipientsRepo.findWorkspaceHostname(workspaceId);
  return domainService.getUrl(hostname);
}
