import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Json } from '@docmost/db/types/db';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationRepo } from '@docmost/db/repos/notification/notification.repo';
import { NotificationService } from '../../core/notification/notification.service';
import { EmailContent, NotificationUser } from './notification.types';

export interface DispatchNotificationOptions {
  userIds: string[];
  type: string;
  workspaceId: string;
  actorId?: string | null;
  pageId?: string | null;
  spaceId?: string | null;
  data?: Json | null;
  /** Collapse repeated events for the same user/page/type within this window. */
  cooldownHours?: number;
  /** Optional email builder, invoked only for recipients that got a notification. */
  email?: (user: NotificationUser) => EmailContent | null;
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationRepo: NotificationRepo,
    private readonly notificationService: NotificationService,
  ) {}

  async dispatch(options: DispatchNotificationOptions): Promise<number> {
    const userIds = [...new Set(options.userIds.filter(Boolean))];
    if (userIds.length === 0) return 0;

    const users = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'email'])
      .where('id', 'in', userIds)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .execute();

    if (users.length === 0) return 0;

    let recentlyNotified = new Set<string>();
    if (
      options.pageId &&
      options.cooldownHours &&
      options.cooldownHours > 0
    ) {
      recentlyNotified =
        await this.notificationRepo.getRecentlyNotifiedUserIds(
          users.map((user) => user.id),
          options.pageId,
          options.type,
          options.cooldownHours,
        );
    }

    let created = 0;
    for (const user of users) {
      if (recentlyNotified.has(user.id)) continue;

      try {
        const notification = await this.notificationService.create({
          userId: user.id,
          workspaceId: options.workspaceId,
          type: options.type,
          actorId: options.actorId ?? null,
          pageId: options.pageId ?? null,
          spaceId: options.spaceId ?? null,
          data: options.data ?? null,
        });

        if (!notification) continue;
        created += 1;

        if (options.email) {
          const email = options.email({
            id: user.id,
            name: user.name,
            email: user.email,
          });
          if (email) {
            await this.notificationService.queueEmail(
              user.id,
              notification.id,
              email.subject,
              email.template,
            );
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(
          `Failed to dispatch ${options.type} notification to ${user.id}: ${message}`,
        );
      }
    }

    return created;
  }
}
