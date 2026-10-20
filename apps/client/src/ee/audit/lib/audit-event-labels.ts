type EventOption = {
  value: string;
  label: string;
};

type EventGroup = {
  group: string;
  items: EventOption[];
};

export const auditEventLabels: Record<string, string> = {
  // Workspace
  "workspace.created": "Created workspace",
  "workspace.updated": "Updated workspace",
  "workspace.invite_created": "Created invitation",
  "workspace.invite_resent": "Resent invitation",
  "workspace.invite_revoked": "Revoked invitation",

  // Users & access
  "user.created": "Created user",
  "user.deleted": "Deleted user",
  "user.login": "Signed in",
  "user.login_failed": "Failed sign-in attempt",
  "user.logout": "Signed out",
  "user.role_changed": "Changed user role",
  "user.password_changed": "Changed password",
  "user.password_reset": "Reset password",
  "user.password_reset_requested": "Requested password reset",
  "user.updated": "Updated user",
  "user.deactivated": "Deactivated user",
  "user.activated": "Activated user",
  "user.mfa_enabled": "Enabled MFA",
  "user.mfa_disabled": "Disabled MFA",
  "user.mfa_backup_code_generated": "Generated MFA backup codes",
  "session.revoked": "Revoked session",
  "session.all_revoked": "Revoked all other sessions",

  // API keys & OAuth
  "api_key.created": "Created API key",
  "api_key.updated": "Updated API key",
  "api_key.deleted": "Deleted API key",
  "oauth_client.registered": "Registered OAuth client",
  "oauth_grant.created": "Authorized OAuth app",
  "oauth_grant.revoked": "Revoked OAuth grant",

  // Integrations
  "integration.installed": "Installed integration",
  "integration.uninstalled": "Uninstalled integration",
  "integration.connected": "Connected integration account",
  "integration.disconnected": "Disconnected integration account",

  // SCIM
  "scim_token.created": "Created SCIM token",
  "scim_token.updated": "Updated SCIM token",
  "scim_token.deleted": "Deleted SCIM token",

  // Spaces
  "space.created": "Created space",
  "space.updated": "Updated space",
  "space.deleted": "Deleted space",
  "space.member_added": "Added space member",
  "space.member_removed": "Removed space member",
  "space.member_role_changed": "Changed space member role",
  "space.exported": "Exported space",

  // Groups
  "group.created": "Created group",
  "group.updated": "Updated group",
  "group.deleted": "Deleted group",
  "group.member_added": "Added group member",
  "group.member_removed": "Removed group member",
  "group.member_role_changed": "Changed group member role",

  // Comments
  "comment.created": "Created comment",
  "comment.updated": "Updated comment",
  "comment.resolved": "Resolved comment",
  "comment.reopened": "Reopened comment",
  "comment.deleted": "Deleted comment",

  // Attachments
  "attachment.uploaded": "Uploaded attachment",
  "attachment.deleted": "Deleted attachment",

  // Pages
  "page.created": "Created page",
  "page.updated": "Updated page",
  "page.trashed": "Moved page to trash",
  "page.deleted": "Deleted page",
  "page.restored": "Restored page",
  "page.moved_to_space": "Moved page to another space",
  "page.duplicated": "Duplicated page",
  "page.version_restored": "Restored page version",
  "page.locked": "Locked page",
  "page.unlocked": "Unlocked page",
  "page.restricted": "Restricted page",
  "page.restriction_removed": "Removed page restriction",
  "page.permission_added": "Added page permission",
  "page.permission_removed": "Removed page permission",
  "page.permission_role_changed": "Changed page permission",
  "page.verification_created": "Created page verification",
  "page.verification_updated": "Updated page verification",
  "page.verification_removed": "Removed page verification",
  "page.verified": "Verified page",
  "page.approval_requested": "Requested page approval",
  "page.approval_rejected": "Rejected page approval",
  "page.clarification_requested": "Requested page clarification",
  "page.marked_obsolete": "Marked page as obsolete",
  "page.imported": "Imported page",
  "page.exported": "Exported page",

  // Sharing
  "share.created": "Created share link",
  "share.deleted": "Deleted share link",

  // SSO
  "sso.provider_created": "Created SSO provider",
  "sso.provider_updated": "Updated SSO provider",
  "sso.provider_deleted": "Deleted SSO provider",

  // License & SIEM
  "license.activated": "Activated license",
  "license.removed": "Removed license",
  "siem_destination.created": "Created SIEM destination",
  "siem_destination.updated": "Updated SIEM destination",
  "siem_destination.deleted": "Deleted SIEM destination",
  "siem_destination.test": "Tested SIEM destination",

  // Templates & document data
  "template.created": "Created template",
  "template.updated": "Updated template",
  "template.deleted": "Deleted template",
  "doc_metadata.updated": "Updated document metadata",

  // Audit trail
  "audit.retention_updated": "Updated retention policy",
  "audit.exported": "Exported audit logs",
  "audit.purged": "Purged expired audit logs",
  "api.request": "Performed an action",
};

export function getEventLabel(event: string): string {
  return auditEventLabels[event] ?? event;
}

export type AuditEventCategory = {
  key: string;
  label: string;
  color: string;
};

const CATEGORIES: Record<string, AuditEventCategory> = {
  security: { key: "security", label: "Security & access", color: "red" },
  user: { key: "user", label: "Users", color: "orange" },
  workspace: { key: "workspace", label: "Workspace", color: "indigo" },
  space: { key: "space", label: "Spaces & groups", color: "cyan" },
  page: { key: "page", label: "Pages", color: "blue" },
  comment: { key: "comment", label: "Comments", color: "grape" },
  data: { key: "data", label: "Data & content", color: "green" },
  integration: { key: "integration", label: "Integrations", color: "teal" },
  system: { key: "system", label: "System", color: "gray" },
};

export function getEventCategory(event: string): AuditEventCategory {
  if (
    /^(user\.(login|logout|login_failed|password|mfa)|session\.)/.test(event)
  ) {
    return CATEGORIES.security;
  }
  if (event.startsWith("user.")) return CATEGORIES.user;
  if (event.startsWith("workspace.")) return CATEGORIES.workspace;
  if (event.startsWith("space.") || event.startsWith("group.")) {
    return CATEGORIES.space;
  }
  if (event.startsWith("page.")) return CATEGORIES.page;
  if (event.startsWith("comment.")) return CATEGORIES.comment;
  if (
    event.startsWith("attachment.") ||
    event.startsWith("template.") ||
    event.startsWith("doc_metadata.") ||
    event === "page.imported" ||
    event === "page.exported" ||
    event === "space.exported"
  ) {
    return CATEGORIES.data;
  }
  if (
    event.startsWith("api_key.") ||
    event.startsWith("oauth") ||
    event.startsWith("integration.") ||
    event.startsWith("scim_") ||
    event.startsWith("sso.") ||
    event.startsWith("license.") ||
    event.startsWith("siem_")
  ) {
    return CATEGORIES.integration;
  }
  return CATEGORIES.system;
}

const CATEGORY_ORDER = [
  "security",
  "user",
  "workspace",
  "space",
  "page",
  "comment",
  "data",
  "integration",
  "system",
];

export const eventFilterOptions: EventGroup[] = CATEGORY_ORDER.map((key) => {
  const category = CATEGORIES[key];
  return {
    group: category.label,
    items: Object.entries(auditEventLabels)
      .filter(([event]) => getEventCategory(event).key === key)
      .map(([value, label]) => ({ value, label })),
  };
}).filter((group) => group.items.length > 0);

export const resourceTypeLabels: Record<string, string> = {
  workspace: "Workspace",
  user: "User",
  page: "Page",
  space: "Space",
  space_member: "Space member",
  group: "Group",
  comment: "Comment",
  share: "Share link",
  api_key: "API key",
  oauth_client: "OAuth client",
  oauth_grant: "OAuth grant",
  integration: "Integration",
  scim_token: "SCIM token",
  sso_provider: "SSO provider",
  workspace_invitation: "Invitation",
  attachment: "Attachment",
  license: "License",
  siem_destination: "SIEM destination",
  template: "Template",
  label: "Label",
  base: "Base",
  session: "Session",
  doc_metadata: "Document metadata",
  personal_space: "Personal space",
  audit_log: "Audit log",
  api_request: "API request",
};

export function getResourceTypeLabel(resourceType: string): string {
  return resourceTypeLabels[resourceType] ?? resourceType;
}

export const actorTypeLabels: Record<string, string> = {
  user: "User",
  system: "System",
  api_key: "API key",
  oauth: "OAuth app",
};

export function getActorTypeLabel(actorType: string): string {
  return actorTypeLabels[actorType] ?? actorType;
}
