import { Module } from '@nestjs/common';
import { CaslModule } from '../../core/casl/casl.module';
import { WorkspaceSettingsRepo } from '../common/workspace-settings.repo';
import { AttachmentSettingsController } from './attachment-settings.controller';
import { AttachmentSettingsService } from './attachment-settings.service';

@Module({
  imports: [CaslModule],
  providers: [AttachmentSettingsService, WorkspaceSettingsRepo],
  controllers: [AttachmentSettingsController],
})
export class AttachmentSettingsModule {}
