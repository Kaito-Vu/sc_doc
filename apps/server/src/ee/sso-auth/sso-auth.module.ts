import { Module } from '@nestjs/common';
import { SsoAuthService } from './sso-auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { SsoAuthController } from './sso-auth.controller';
import { SsoModule } from '../sso/sso.module';
import { SessionModule } from '../../core/session/session.module';
import { WorkspaceModule } from '../../core/workspace/workspace.module';
import { AttachmentModule } from '../../core/attachment/attachment.module';

@Module({
  imports: [SsoModule, SessionModule, WorkspaceModule, AttachmentModule],
  providers: [SsoAuthService, OidcAuthService],
  controllers: [SsoAuthController],
})
export class SsoAuthModule {}
