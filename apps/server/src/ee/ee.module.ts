import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InvitesDisabledGuard } from './common/guards/invites-disabled.guard';
import { LicenceModule } from './licence/licence.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { AuditEeModule } from './audit/audit.module';
import { MfaModule } from './mfa/mfa.module';
import { PagePermissionModule } from './page-permission/page-permission.module';
import { TemplateModule } from './template/template.module';
import { ScimModule } from './scim/scim.module';
import { PageVerificationModule } from './page-verification/page-verification.module';
import { PersonalSpaceModule } from './personal-space/personal-space.module';
import { StatisticsModule } from './statistics/statistics.module';
import { PresenceModule } from './presence/presence.module';
import { SsoModule } from './sso/sso.module';
import { SsoAuthModule } from './sso-auth/sso-auth.module';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';
import { BaseModule } from './base/base.module';
import { CommentEeModule } from './comment/comment.module';
import { DocumentImportModule } from './document-import/document-import.module';
import { ConfluenceImportModule } from './confluence-import/confluence-import.module';
import { EaImportModule } from './ea-import/ea-import.module';
import { AttachmentEeModule } from './attachments-ee/attachment-ee.module';
import { TypesenseEeModule } from './typesense/typesense.module';
import { DocxExportModule } from './docx-export/docx-export.module';
import { PdfExportModule } from './pdf-export/pdf-export.module';
import { McpModule } from './mcp/mcp.module';
import { PluginsModule } from './plugins/plugins.module';
import { PLUGIN_MODULES } from './plugins/plugin-modules';
import { WorkspaceLocaleModule } from './workspace-locale/workspace-locale.module';
import { DocMetadataModule } from './docs/doc-metadata.module';
import { ClientLogModule } from './logging/client-log.module';
import { PlatformModule } from './platform/platform.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PageLabelInheritModule } from './page-label-inherit/page-label-inherit.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { AttachmentSettingsModule } from './attachment-settings/attachment-settings.module';
import { MailSettingsModule } from './mail-settings/mail-settings.module';
import { FeatureGateGuard } from './common/guards/feature-gate.guard';
import { StorageBucketsModule } from './storage-buckets/storage-buckets.module';
import { UserProfileExtrasModule } from './user-profile-extras/user-profile-extras.module';

@Module({
  imports: [
    StorageBucketsModule,
    UserProfileExtrasModule,
    PlatformModule,
    ClientLogModule,
    LicenceModule,
    AuditEeModule,
    ApiKeyModule,
    MfaModule,
    PagePermissionModule,
    TemplateModule,
    ScimModule,
    PageVerificationModule,
    PersonalSpaceModule,
    StatisticsModule,
    PresenceModule,
    SsoModule,
    SsoAuthModule,
    AiChatModule,
    AiModule,
    BillingModule,
    BaseModule,
    CommentEeModule,
    DocumentImportModule,
    ConfluenceImportModule,
    EaImportModule,
    AttachmentEeModule,
    TypesenseEeModule,
    DocxExportModule,
    PdfExportModule,
    McpModule,
    PluginsModule,
    ...PLUGIN_MODULES,
    WorkspaceLocaleModule,
    DocMetadataModule,
    NotificationsModule,
    PageLabelInheritModule,
    AnnouncementModule,
    AttachmentSettingsModule,
    MailSettingsModule,
  ],
  providers: [
    FeatureGateGuard,
    { provide: APP_GUARD, useClass: InvitesDisabledGuard },
  ],
  exports: [
    LicenceModule,
    ApiKeyModule,
    MfaModule,
    ScimModule,
    BaseModule,
    DocumentImportModule,
    ConfluenceImportModule,
    AttachmentEeModule,
    TypesenseEeModule,
    PdfExportModule,
    PluginsModule,
    WorkspaceLocaleModule,
  ],
})
export class EeModule {}

