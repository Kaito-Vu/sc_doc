import { Module } from '@nestjs/common';
import { CommentResolveService } from './comment-resolve.service';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';

@Module({
  imports: [CollaborationModule, PageAccessModule],
  providers: [CommentResolveService],
})
export class CommentEeModule {}
