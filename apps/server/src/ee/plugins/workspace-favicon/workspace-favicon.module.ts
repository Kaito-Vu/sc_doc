import { Module } from '@nestjs/common';
import { WorkspaceFaviconController } from './controllers/workspace-favicon.controller';
import { WorkspaceFaviconRepository } from './repositories/workspace-favicon.repo';

@Module({
  controllers: [WorkspaceFaviconController],
  providers: [WorkspaceFaviconRepository],
})
export class WorkspaceFaviconModule {}
