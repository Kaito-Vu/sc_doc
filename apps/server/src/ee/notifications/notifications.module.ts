import { Module } from '@nestjs/common';
import { NotificationModule } from '../../core/notification/notification.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { NotificationRecipientsRepo } from './notification-recipients.repo';
import { NotificationRecipientResolver } from './notification-recipient.resolver';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { PageEditSupplementService } from './page-edit-supplement.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { PageLifecycleNotificationListener } from './listeners/page-lifecycle.listener';
import { SpaceMembershipNotificationListener } from './listeners/space-membership.listener';

@Module({
  imports: [NotificationModule, CollaborationModule],
  controllers: [NotificationPreferencesController],
  providers: [
    NotificationRecipientsRepo,
    NotificationRecipientResolver,
    NotificationDispatcher,
    PageEditSupplementService,
    PageLifecycleNotificationListener,
    SpaceMembershipNotificationListener,
  ],
})
export class NotificationsModule {}
