import { Module } from '@nestjs/common';
import { QueueModule } from '../../integrations/queue/queue.module';
import { SpaceAccessRequestController } from './space-access-request.controller';
import { SpaceAccessRequestService } from './space-access-request.service';
import { SpaceAccessRequestRepo } from './space-access-request.repo';

@Module({
  imports: [QueueModule],
  controllers: [SpaceAccessRequestController],
  providers: [SpaceAccessRequestService, SpaceAccessRequestRepo],
  exports: [SpaceAccessRequestService, SpaceAccessRequestRepo],
})
export class SpaceAccessRequestModule {}
