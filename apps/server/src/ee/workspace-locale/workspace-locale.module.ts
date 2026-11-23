import { Module } from '@nestjs/common';
import { WorkspaceLocaleController } from './workspace-locale.controller';
import { WorkspaceSettingsRepo } from '../common/workspace-settings.repo';

@Module({
  controllers: [WorkspaceLocaleController],
  providers: [WorkspaceSettingsRepo],
})
export class WorkspaceLocaleModule {}
