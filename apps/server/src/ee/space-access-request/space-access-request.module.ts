import { Module } from '@nestjs/common';
import { NotificationModule } from '../../core/notification/notification.module';
import { QueueModule } from '../../integrations/queue/queue.module';
import { SpaceAccessRequestController } from './space-access-request.controller';
import { SpaceAccessRequestService } from './space-access-request.service';
import { SpaceAccessRequestRepo } from './space-access-request.repo';
import { SpaceAccessRequestNotification } from './space-access-request.notification';

@Module({
  imports: [QueueModule, NotificationModule],
  controllers: [SpaceAccessRequestController],
  providers: [
    SpaceAccessRequestService,
    SpaceAccessRequestRepo,
    SpaceAccessRequestNotification,
  ],
  exports: [SpaceAccessRequestService, SpaceAccessRequestRepo],
})
export class SpaceAccessRequestModule {}
