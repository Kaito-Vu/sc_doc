import { Module } from '@nestjs/common';
import { CaslModule } from '../../core/casl/casl.module';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';

@Module({
  imports: [CaslModule],
  providers: [MailSettingsService],
  controllers: [MailSettingsController],
})
export class MailSettingsModule {}
