import { Module } from '@nestjs/common';
import { PageLockService } from './page-lock.service';
import { PageLockController } from './page-lock.controller';
import { CollabAccessModule } from '../../collaboration/collab-access.module';

@Module({
  imports: [CollabAccessModule],
  providers: [PageLockService],
  controllers: [PageLockController],
})
export class PageLockModule {}
