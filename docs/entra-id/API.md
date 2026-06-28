# Azure AD Plugin API Reference

Complete API documentation for Azure AD plugin endpoints.

## Base URL

```
https://your-instance.docmost.com/api
```

## Authentication

All endpoints (except public ones) require:

```
Authorization: Bearer <JWT_TOKEN>
```

## Endpoints

### 1. List All Plugins

Get all available plugins and their configuration status.

**Request**
```
GET /plugins
```

**Headers**
```
Authorization: Bearer <token>
```

**Response**
```json
{
  "plugins": [
    {
      "id": "azure-ad",
      "name": "Azure AD (Entra ID)",
      "version": "1.0.0",
      "description": "OIDC login and group sync with Microsoft Azure AD / Entra ID",
      "enabled": true,
      "configured": true,
      "configLocation": "security",
      "hooks": [
        "auth:oidcLogin",
        "azure-ad:validateTenant",
        "azure-ad:onGroupSync"
      ]
    }
  ]
}
```

### 2. Get Azure AD Plugin Configuration

Get current Azure AD configuration for the workspace.

**Request**
```
GET /plugins/azure-ad
```

**Headers**
```
Authorization: Bearer <token>
```

**Response**
```json
{
  "id": "azure-ad",
  "pluginId": "azure-ad",
  "workspaceId": "workspace-uuid",
  "enabled": true,
  "configured": true,
  "config": {
    "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "clientSecret": "***REDACTED***",
    "scopes": ["openid", "profile", "email"],
    "groupSyncEnabled": true,
    "groupClaimName": "groups",
    "groupFilters": [],
    "groupMappingRules": {
      "admin-group-id": "workspace-admin",
      "member-group-id": "workspace-member"
    },
    "validateIssuer": true,
    "validateAudience": true,
    "requireEmailDomainMatch": false,
    "allowedEmailDomains": []
  },
  "createdAt": "2026-07-01T12:00:00Z",
  "updatedAt": "2026-07-01T12:00:00Z",
  "version": 1
}
```

**Error Response**
```json
{
  "statusCode": 404,
  "message": "Plugin azure-ad not found"
}
```

### 3. Update Azure AD Configuration

Update plugin configuration (partial or full).

**Request**
```
PUT /plugins/azure-ad/config
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "config": {
    "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "clientSecret": "new-secret-value",
    "groupSyncEnabled": true,
    "groupMappingRules": {
      "admin-group-id": "workspace-admin"
    }
  },
  "enabled": true
}
```

**Parameters**
- `config` (object, optional) - Configuration object
- `enabled` (boolean, optional) - Enable/disable plugin

**Response**
```json
{
  "id": "config-uuid",
  "pluginId": "azure-ad",
  "workspaceId": "workspace-uuid",
  "enabled": true,
  "config": {
    "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "clientSecret": "***REDACTED***",
    "groupSyncEnabled": true,
    "groupMappingRules": {
      "admin-group-id": "workspace-admin"
    }
  },
  "updatedAt": "2026-07-01T13:00:00Z",
  "version": 2
}
```

**Error Responses**

Invalid configuration:
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

### 4. Toggle Plugin

Enable or disable the Azure AD plugin.

**Request**
```
POST /plugins/azure-ad/toggle
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "enabled": true
}
```

**Response**
```json
{
  "success": true,
  "enabled": true
}
```

### 5. Test Azure AD Connection

Test if provided credentials are valid.

**Request**
```
POST /plugins/azure-ad/test-connection
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "clientSecret": "secret-value"
}
```

**Parameters**
- `tenantId` (string, required) - Azure AD tenant ID (UUID)
- `clientId` (string, required) - Azure app client ID (UUID)
- `clientSecret` (string, required) - Client secret value

**Response - Success**
```json
{
  "success": true,
  "message": "Azure AD credentials are valid",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Response - Failure**
```json
{
  "statusCode": 400,
  "message": "Failed to validate Azure AD credentials",
  "error": "Invalid tenant ID or client credentials"
}
```

## Configuration Schema

### Full Configuration Object

```typescript
interface AzureAdConfig {
  // Required
  tenantId: string           // Azure Directory (Tenant) ID (UUID)
  clientId: string           // Application (Client) ID (UUID)
  clientSecret: string       // Client secret (encrypted at rest)
  
  // OAuth
  scopes?: string[]          // Default: ["openid", "profile", "email"]
  
  // Group Sync
  groupSyncEnabled?: boolean // Default: false
  groupClaimName?: string    // Default: "groups"
  groupFilters?: string[]    // Array of group display names to sync
  groupMappingRules?: {      // Map group IDs to workspace roles
    [groupId: string]: "workspace-admin" | "workspace-member" | "workspace-viewer"
  }
  
  // Validation
  validateIssuer?: boolean   // Default: true
  validateAudience?: boolean // Default: true
  
  // Email Domain
  requireEmailDomainMatch?: boolean  // Default: false
  allowedEmailDomains?: string[]     // Whitelisted domains
}
```

## Error Codes

| Code | Status | Message | Solution |
|------|--------|---------|----------|
| 400 | Bad Request | Invalid configuration | Check config against schema |
| 401 | Unauthorized | Missing/invalid token | Provide valid JWT token |
| 403 | Forbidden | Insufficient permissions | Must be workspace admin |
| 404 | Not Found | Plugin not found | Plugin may not be installed |
| 500 | Internal Server Error | Server error | Check server logs |

## Rate Limiting

API endpoints are rate-limited:
- 100 requests per minute per user
- 1000 requests per minute per workspace

Rate limit headers in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1625097600
```

## Secrets Handling

### Sending Secrets

When creating/updating configuration:
```json
{
  "config": {
    "clientSecret": "kz8Q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

### Receiving Secrets

API always redacts secrets in responses:
```json
{
  "config": {
    "clientSecret": "***REDACTED***"
  }
}
```

To update without changing secret, send the redacted value:
```json
{
  "config": {
    "clientSecret": "***REDACTED***"
  }
}
```

The API will preserve the existing secret if redacted value is sent.

## Webhook Events (Future)

When implemented, the following events will be published:

```
azure-ad.config.updated
azure-ad.login.success
azure-ad.login.failed
azure-ad.groups.synced
azure-ad.groups.sync.failed
```

## Examples

### Complete Setup Flow

```bash
# 1. Get plugin info
curl -X GET \
  https://your-instance.docmost.com/api/plugins/azure-ad \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Test connection
curl -X POST \
  https://your-instance.docmost.com/api/plugins/azure-ad/test-connection \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "clientSecret": "secret-value"
  }'

# 3. Update configuration
curl -X PUT \
  https://your-instance.docmost.com/api/plugins/azure-ad/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "clientId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
      "clientSecret": "secret-value",
      "groupSyncEnabled": true,
      "groupMappingRules": {
        "admin-group-id": "workspace-admin"
      }
    },
    "enabled": true
  }'

# 4. Toggle plugin
curl -X POST \
  https://your-instance.docmost.com/api/plugins/azure-ad/toggle \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## OpenAPI/Swagger

OpenAPI specification available at:
```
https://your-instance.docmost.com/api-docs
```

Search for `/plugins/azure-ad` endpoints.
