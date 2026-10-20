import { Module } from '@nestjs/common';
import { ScimTokenService } from './scim-token.service';
import { ScimTokenController } from './scim-token.controller';
import { ScimTokenRepo } from './scim-token.repo';
import { ScimProvisioningService } from './scim-provisioning.service';
import { ScimProvisioningController } from './scim-provisioning.controller';
import { ScimAuthGuard } from './scim-auth.guard';

import { WorkspaceModule } from '../../core/workspace/workspace.module';
import { GroupModule } from '../../core/group/group.module';

@Module({
  imports: [WorkspaceModule, GroupModule],
  providers: [
    ScimTokenService,
    ScimTokenRepo,
    ScimProvisioningService,
    ScimAuthGuard,
  ],
  controllers: [ScimTokenController, ScimProvisioningController],
  exports: [ScimTokenService],
})
export class ScimModule {}
