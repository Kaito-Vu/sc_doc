import { Module } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementRepo } from './announcement.repo';
import { CaslModule } from '../../core/casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [AnnouncementService, AnnouncementRepo],
  controllers: [AnnouncementController],
})
export class AnnouncementModule {}
