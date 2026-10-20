import { Module } from '@nestjs/common';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';
import { DocMetadataController } from './doc-metadata.controller';
import { DocMetadataRepo } from './doc-metadata.repo';
import { DocMetadataService } from './doc-metadata.service';

@Module({
  imports: [PageAccessModule],
  providers: [DocMetadataRepo, DocMetadataService],
  controllers: [DocMetadataController],
  exports: [DocMetadataService],
})
export class DocMetadataModule {}
