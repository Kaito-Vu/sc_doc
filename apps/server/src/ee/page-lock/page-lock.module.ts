import { Module, OnModuleInit } from '@nestjs/common';
import { PageLockService } from './page-lock.service';
import { PageLockController } from './page-lock.controller';
import { PluginConfigService } from '../plugins/services/plugin-config.service';
import { setPageLockConfigService } from './page-lock.enabled';
import { CollabAccessModule } from '../../collaboration/collab-access.module';

@Module({
  imports: [CollabAccessModule],
  providers: [PageLockService],
  controllers: [PageLockController],
})
export class PageLockModule implements OnModuleInit {
  constructor(private readonly pluginConfig: PluginConfigService) {}

  onModuleInit() {
    setPageLockConfigService(this.pluginConfig);
  }
}
