# Azure AD Plugin Configuration Reference

Complete configuration options for the Azure AD plugin.

## Configuration Structure

Configuration is stored per workspace in JSON format with the following structure:

```typescript
interface AzureAdConfig {
  // Required fields
  tenantId: string
  clientId: string
  clientSecret: string
  
  // Optional fields
  scopes?: string[]
  groupSyncEnabled?: boolean
  groupClaimName?: string
  groupFilters?: string[]
  groupMappingRules?: Record<string, string>
  validateIssuer?: boolean
  validateAudience?: boolean
  requireEmailDomainMatch?: boolean
  allowedEmailDomains?: string[]
}
```

## Required Fields

### tenantId

**Type**: `string` (UUID)  
**Required**: Yes  
**Pattern**: `^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`

Azure AD Directory (Tenant) ID.

**Example**:
```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Where to find**:
1. Azure Portal → Azure Active Directory
2. Properties → Directory ID (also called "Tenant ID")

### clientId

**Type**: `string` (UUID)  
**Required**: Yes  
**Pattern**: `^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`

Application (Client) ID registered in Azure.

**Example**:
```json
{
  "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
}
```

**Where to find**:
1. Azure Portal → App Registrations → Your App
2. Overview → Application (client) ID

### clientSecret

**Type**: `string`  
**Required**: Yes  
**Encrypted**: Yes (at rest in database)

Client secret for OAuth authentication. Keep this confidential.

**Example**:
```json
{
  "clientSecret": "kz8Q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Where to find**:
1. Azure Portal → App Registrations → Your App
2. Certificates & secrets → Client secrets
3. **Note**: Secret only visible immediately after creation

**Security**:
- Never commit to version control
- Rotate regularly (before expiration)
- Use strong secrets (Azure generates strong ones)

## Optional OAuth Fields

### scopes

**Type**: `string[]`  
**Default**: `["openid", "profile", "email"]`

OAuth 2.0 scopes requested from Azure AD.

**Example**:
```json
{
  "scopes": ["openid", "profile", "email", "Directory.Read.All"]
}
```

**Common scopes**:
| Scope | Purpose | Required for |
|-------|---------|--------|
| `openid` | Request ID token | OIDC login (required) |
| `profile` | Get user profile claims | User info (recommended) |
| `email` | Get user email | User creation (recommended) |
| `Directory.Read.All` | Read Azure AD groups | Group sync (if enabled) |
| `offline_access` | Get refresh token | Token refresh (optional) |

**Guidelines**:
- Always include `openid`, `profile`, `email`
- Include `Directory.Read.All` if group sync enabled
- Minimize scopes for security (only request what you need)

## Optional Group Sync Fields

### groupSyncEnabled

**Type**: `boolean`  
**Default**: `false`

Enable or disable automatic group synchronization from Azure AD.

**Example**:
```json
{
  "groupSyncEnabled": true
}
```

**Impact**:
- When enabled: User's Azure AD groups are fetched on login
- When disabled: Groups not synced (faster login)
- Requires: `Directory.Read.All` scope and API permission

### groupClaimName

**Type**: `string`  
**Default**: `"groups"`

Name of JWT claim containing group IDs.

**Example**:
```json
{
  "groupClaimName": "groups"
}
```

**Common values**:
- `groups` - Standard group claim
- `roles` - If configured for roles
- `memberOf` - If using custom mapping

**Note**: Token may contain group IDs differently based on Azure AD configuration.

### groupFilters

**Type**: `string[]`  
**Default**: `[]` (sync all groups)

Whitelist of Azure AD group display names to sync.

**Example**:
```json
{
  "groupFilters": ["Engineering", "Admins", "Sales"]
}
```

**Behavior**:
- Empty array: Sync all groups user belongs to
- With values: Only sync groups matching display names
- Case-sensitive matching

**Use cases**:
- Sync only company-related groups
- Exclude personal or organizational groups
- Reduce database load with many groups

### groupMappingRules

**Type**: `object` (Record<string, "workspace-admin" | "workspace-member" | "workspace-viewer">)  
**Default**: `{}`

Map Azure AD group IDs to Docmost workspace roles.

**Example**:
```json
{
  "groupMappingRules": {
    "xxxxxxxx-xxxx-xxxx-xxxx-admin-group": "workspace-admin",
    "xxxxxxxx-xxxx-xxxx-xxxx-member-group": "workspace-member",
    "xxxxxxxx-xxxx-xxxx-xxxx-viewer-group": "workspace-viewer"
  }
}
```

**Available roles**:
| Role | Permissions | Use case |
|------|------------|----------|
| `workspace-admin` | Full access, manage settings | Admins |
| `workspace-member` | Create/edit documents | Regular users |
| `workspace-viewer` | Read-only access | External stakeholders |

**Finding group IDs**:
1. Azure Portal → Azure AD → Groups
2. Select group → Overview → Object ID (copy this)
3. Use as key in mapping rules

**Best practices**:
- Map admin group to `workspace-admin`
- Map general users to `workspace-member`
- Be explicit about roles
- Test mappings before deployment

**Edge cases**:
- User in multiple mapped groups: Highest privilege role wins
- User in unmapped group: No role change
- Group mapping added later: Applied on next login

## Optional Validation Fields

### validateIssuer

**Type**: `boolean`  
**Default**: `true`

Validate token issuer matches configured tenant.

**Example**:
```json
{
  "validateIssuer": true
}
```

**Security**: Prevents tokens from other Azure AD tenants

**Recommendation**: Leave enabled (security best practice)

### validateAudience

**Type**: `boolean`  
**Default**: `true`

Validate token audience (aud claim) matches configured client ID.

**Example**:
```json
{
  "validateAudience": true
}
```

**Security**: Ensures token is intended for this application

**Recommendation**: Leave enabled (security best practice)

## Optional Email Domain Fields

### requireEmailDomainMatch

**Type**: `boolean`  
**Default**: `false`

Require user's email to match allowed domains.

**Example**:
```json
{
  "requireEmailDomainMatch": true,
  "allowedEmailDomains": ["company.com", "subsidiary.com"]
}
```

**Behavior**:
- When disabled: Any Azure AD user can login
- When enabled: Only users with whitelisted email domains

**Use cases**:
- Restrict to company domain
- Allow specific partner domains
- Prevent external email logins

### allowedEmailDomains

**Type**: `string[]`  
**Default**: `[]`

Whitelist of email domains allowed for login.

**Example**:
```json
{
  "allowedEmailDomains": ["example.com", "subsidiary.org"]
}
```

**Format**: Domain name only (no email addresses)
- ✓ `example.com`
- ✗ `user@example.com`
- ✗ `https://example.com`

**Matching**: Case-insensitive

**Only effective when**: `requireEmailDomainMatch` is `true`

## Complete Configuration Examples

### Minimal Configuration

OIDC login only, no group sync:

```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "clientSecret": "secret-value"
}
```

### Standard Configuration

With group sync and role mapping:

```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "clientSecret": "secret-value",
  "scopes": ["openid", "profile", "email", "Directory.Read.All"],
  "groupSyncEnabled": true,
  "groupClaimName": "groups",
  "groupMappingRules": {
    "admin-group-id": "workspace-admin",
    "member-group-id": "workspace-member"
  },
  "validateIssuer": true,
  "validateAudience": true
}
```

### Enterprise Configuration

With domain restriction and group filtering:

```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "clientSecret": "secret-value",
  "scopes": ["openid", "profile", "email", "Directory.Read.All"],
  "groupSyncEnabled": true,
  "groupClaimName": "groups",
  "groupFilters": ["Engineering", "Product", "Sales", "Admin"],
  "groupMappingRules": {
    "engineering-admins": "workspace-admin",
    "engineering-team": "workspace-member",
    "product-team": "workspace-member",
    "sales-team": "workspace-member",
    "viewers": "workspace-viewer"
  },
  "validateIssuer": true,
  "validateAudience": true,
  "requireEmailDomainMatch": true,
  "allowedEmailDomains": ["company.com", "subsidiary.com"]
}
```

## JSON Schema

Full JSON Schema for configuration validation:

```json
{
  "type": "object",
  "title": "Azure AD Configuration",
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenant ID",
      "description": "Azure Directory (Tenant) ID (UUID format)",
      "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
    },
    "clientId": {
      "type": "string",
      "title": "Client ID",
      "description": "Application (Client) ID (UUID format)",
      "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
    },
    "clientSecret": {
      "type": "string",
      "title": "Client Secret",
      "isSecret": true
    },
    "scopes": {
      "type": "array",
      "items": {"type": "string"},
      "default": ["openid", "profile", "email"]
    },
    "groupSyncEnabled": {
      "type": "boolean",
      "default": false
    },
    "groupClaimName": {
      "type": "string",
      "default": "groups"
    },
    "groupFilters": {
      "type": "array",
      "items": {"type": "string"},
      "default": []
    },
    "groupMappingRules": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "enum": ["workspace-admin", "workspace-member", "workspace-viewer"]
      },
      "default": {}
    },
    "validateIssuer": {
      "type": "boolean",
      "default": true
    },
    "validateAudience": {
      "type": "boolean",
      "default": true
    },
    "requireEmailDomainMatch": {
      "type": "boolean",
      "default": false
    },
    "allowedEmailDomains": {
      "type": "array",
      "items": {"type": "string"},
      "default": []
    }
  }
}
```

## Configuration Validation

Configurations are validated using JSON Schema. Invalid configurations will be rejected with specific error messages:

**Example error**:
```json
{
  "statusCode": 400,
  "message": "Invalid configuration",
  "errors": [
    {
      "field": "tenantId",
      "message": "Invalid UUID format"
    }
  ]
}
```

## Updating Configuration

Configuration can be updated via:

1. **Web UI**: Settings → Security & SSO → Azure AD
2. **API**: `PUT /api/plugins/azure-ad/config`

**Important**:
- Only admins can update configuration
- Changes take effect immediately
- Secrets must be re-entered if updated
- Validation happens before saving

## Secrets Management

### Sending Secrets

When creating or updating:
```json
{
  "clientSecret": "kz8Q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Receiving Secrets

API always redacts secrets:
```json
{
  "clientSecret": "***REDACTED***"
}
```

### Updating Without Changing Secret

To update other fields without changing the secret:
```json
{
  "clientSecret": "***REDACTED***"
}
```

The system preserves the existing secret.

## Environment Variables

Configuration can optionally be loaded from environment variables (if supported):

```bash
AZURE_AD_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
AZURE_AD_CLIENT_SECRET=kz8Q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_AD_GROUP_SYNC_ENABLED=true
AZURE_AD_GROUP_MAPPING_RULES='{"admin-group":"workspace-admin"}'
```

## Related Documentation

- [SETUP.md](./SETUP.md) - Step-by-step setup guide
- [SECURITY.md](./SECURITY.md) - Security considerations
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Configuration issues
- [API.md](./API.md) - Configuration API endpoints
