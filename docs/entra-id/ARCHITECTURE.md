# Azure AD Plugin Architecture

Technical architecture and design documentation for the Azure AD plugin.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [OIDC Authentication Flow](#oidc-authentication-flow)
4. [Group Sync Workflow](#group-sync-workflow)
5. [Database Schema](#database-schema)
6. [Hook System](#hook-system)
7. [Plugin Discovery](#plugin-discovery)
8. [Error Handling](#error-handling)

## System Overview

The Azure AD plugin is a modular NestJS plugin that extends Docmost authentication with Azure AD support. It uses OIDC for authentication and Microsoft Graph API for group synchronization.

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ OAuth 2.0 OIDC Flow
       ▼
┌─────────────────────────────────────┐
│        Docmost Application          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │   SSO Auth Controller           │ │
│ │ (Handles OAuth callback)        │ │
│ └────────┬────────────────────────┘ │
│          │
│ ┌────────▼────────────────────────┐ │
│ │  Azure AD Plugin Module         │ │
│ ├────────────────────────────────┤ │
│ │ • Token Validation             │ │
│ │ • Issuer/Audience Checks       │ │
│ │ • User Info Extraction         │ │
│ │ • Group Sync (Graph API)       │ │
│ │ • Hook Handlers                │ │
│ └─────────────────────────────────┘ │
└─────────────┬───────────────────────┘
              │
       ┌──────┴──────┬──────────────┐
       ▼             ▼              ▼
   ┌────────┐  ┌─────────┐  ┌──────────┐
   │ PostgreSQL  │   Azure AD  │ Microsoft │
   │ (User Data) │  (Auth)     │  Graph    │
   └────────┘  └─────────┘  └──────────┘
```

## Component Architecture

### Backend Services

#### 1. AzureAdService
**Purpose**: Core Azure AD logic

```typescript
class AzureAdService {
  // URL builders
  buildTokenUrl(tenantId)           // Azure token endpoint
  buildAuthorizeUrl(...)            // OAuth authorize URL
  buildGraphApiUrl(endpoint)        // Microsoft Graph endpoint
  
  // Token operations
  extractClaims(token)              // Decode JWT
  validateToken(token, config)      // Full validation
  
  // Validation methods
  validateTokenExpiry(claims)       // Check exp claim
  validateIssuer(claims, tenantId)  // Check iss claim
  validateAudience(claims, clientId) // Check aud claim
  validateTenant(claims, tenantId)  // Check tid claim
  
  // User info
  extractUserInfo(claims, config)   // Get user details
  
  // OAuth flow
  exchangeCodeForToken(code, ...)   // Token exchange
}
```

#### 2. TokenValidationService
**Purpose**: JWT signature verification and JWKS caching

```typescript
class TokenValidationService {
  // JWKS operations
  fetchAzureJwks(tenantId)          // Get public keys
  
  // Signature verification
  verifyTokenSignature(token, tenantId) // Validate JWT
  
  // Token inspection
  extractTokenHeader(token)          // Get header info
  isTokenExpired(token)             // Quick expiry check
}
```

#### 3. GroupSyncService
**Purpose**: Graph API group synchronization and role mapping

```typescript
class GroupSyncService {
  // Graph API
  fetchUserGroups(accessToken)      // Get user's groups
  
  // Role mapping
  mapGroupsToRoles(groups, rules)   // Map to workspace roles
  
  // Filtering
  filterGroupsByNames(groups, names) // Include filter
  
  // Combined operation
  syncGroupsResult(groups, rules, filters) // Full sync logic
}
```

#### 4. TokenCacheService
**Purpose**: In-memory caching with TTL

```typescript
class TokenCacheService {
  cacheToken(key, token, ttl)       // Cache tokens
  getToken(key)                     // Retrieve cached token
  clearToken(key)                   // Remove cache entry
  cleanupExpiredTokens()            // Cleanup job
}
```

### Hook System

#### AuthOidcLoginHandler
**Hook**: `auth:oidcLogin`
**Purpose**: Handle OIDC login flow

**Flow**:
1. Verify token signature using Azure JWKS
2. Validate token claims (expiry, issuer, audience, tenant)
3. Extract user information
4. (Optional) Fetch and sync groups via Graph API
5. Return enriched context to auth service

**Context In**:
```typescript
{
  providerId: string           // SSO provider ID
  idToken: string             // JWT from Azure AD
  accessToken?: string        // For Graph API calls
  workspaceId: string
  config: AzureAdConfig
}
```

**Context Out**:
```typescript
{
  userInfo: {
    id: string                // User unique ID
    email: string
    name?: string
  }
  groups?: string[]           // Azure AD group IDs
  groupMapping?: string[]     // Mapped workspace roles
  tokenClaims?: object        // Full JWT claims
}
```

#### AzureAdValidateTenantHandler
**Hook**: `azure-ad:validateTenant`
**Purpose**: Optional tenant validation

Checks if user's tenant matches configured tenant (security check).

### Controllers

#### AzureAdController
**Endpoints**:
- `POST /plugins/azure-ad/test-connection` - Validate credentials

**Purpose**: Admin testing endpoint

## OIDC Authentication Flow

Complete OAuth 2.0 OIDC flow for user authentication:

```
User              Browser          Docmost          Azure AD       Microsoft
                                                                    Graph API
 │                  │                 │                │               │
 ├──1. Login────────┤                 │                │               │
 │                  ├──2. Redirect────┤                │               │
 │                  │   to Azure       │                │               │
 │                  ├─────────────────────────────────┤                │
 │                  │                  │                ├──3. Auth────┐ │
 │                  │                  │                │ (User MFA)  │ │
 │                  │                  │                ├──────────┬──┘ │
 │                  │  4. Redirect back with code       │          │    │
 │                  │<────────────────────────────┤     │          │    │
 │                  ├──────────────────────────────────────────┐   │    │
 │                  │                  │  5. Exchange code for │   │    │
 │                  │                  │     token (backend)   │   │    │
 │                  │                  │<────────────────────────┐ │    │
 │                  │                  │    6. ID Token +      │ │    │
 │                  │                  │       Access Token     │ │    │
 │                  │                  │  ┌──────────────────┘ │    │
 │                  │                  │  │  7. (Optional)     │    │
 │                  │                  │  │  Fetch groups      │    │
 │                  │                  │  │  from Graph API    │    │
 │                  │                  ├─────────────────────────┤  │
 │                  │                  │        │                 │  │
 │                  │                  │<────────────────────────┤  │
 │                  │                  │    Group list           │  │
 │                  │                  ├──┐                      │  │
 │                  │                  │  └─ 8. Validate token   │  │
 │                  │                  │  9. Create/update user  │  │
 │                  │                  │ 10. Sync groups & roles │  │
 │                  │                  │ 11. Create session      │  │
 │                  │                  │ 12. Return JWT token    │  │
 │                  │                  ├─────────────────────────┼──┼──
 │                  │<─────────────────────────────────────────────┤
 │                  │  13. Store token in cookie
 │                  │  14. Redirect to app
 │                  ├──────────────────────────────────────────────────
 │<─────────────────┤
 │  User logged in  │
```

### Token Validation Sequence

```
ID Token (JWT)
    ↓
1. Check format and decode
    ↓
2. Verify signature using Azure JWKS
    ↓
3. Check token not expired (exp claim)
    ↓
4. Validate issuer matches tenant
    ↓
5. Validate audience matches client ID
    ↓
6. Validate tenant ID matches configuration
    ↓
7. Extract user info from claims
    ↓
✓ Token Valid
```

## Group Sync Workflow

Optional automatic group synchronization from Azure AD:

```
User Logs In
    ↓
Access Token obtained from Azure AD
    ↓
Call Graph API: GET /me/memberOf
    ↓
Azure returns user's group memberships
    ↓
Filter groups (if filters configured)
    ↓
Map group IDs to workspace roles
    ├─ admin-group-id → workspace-admin
    ├─ member-group-id → workspace-member
    └─ viewer-group-id → workspace-viewer
    ↓
Sync groups to database
    ├─ Remove groups no longer member of
    ├─ Add new groups
    └─ Store mapping with timestamps
    ↓
Apply workspace roles based on mapping
    ↓
✓ User authenticated with synced groups and roles
```

### Graph API Calls

**Request**:
```
GET https://graph.microsoft.com/v1.0/me/memberOf
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "value": [
    {
      "@odata.type": "#microsoft.graph.group",
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "displayName": "Engineering Team"
    },
    {
      "@odata.type": "#microsoft.graph.group",
      "id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
      "displayName": "Admin Group"
    }
  ],
  "@odata.nextLink": "..."
}
```

### Rate Limiting

Graph API rate limiting is handled:
- Monitor `429 Too Many Requests` responses
- Extract `Retry-After` header
- Implement exponential backoff
- Cache tokens to minimize API calls

## Database Schema

### Table: `azure_ad_user_groups`

Tracks user's Azure AD group memberships per workspace.

```sql
CREATE TABLE azure_ad_user_groups (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL (FK users.id),
  workspace_id UUID NOT NULL (FK workspaces.id),
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  
  UNIQUE(user_id, workspace_id, group_id),
  
  INDEX(user_id, workspace_id),
  INDEX(workspace_id, group_id),
  INDEX(created_at)
)
```

### Configuration Storage

Plugin configuration stored in `plugin_configurations` table:

```
workspace_id: UUID
plugin_id: 'azure-ad'
enabled: boolean
config: {
  tenantId: string
  clientId: string
  clientSecret: string (encrypted)
  groupSyncEnabled: boolean
  groupMappingRules: object
  ...
}
```

## Hook System

### Hook Registry

Docmost provides a global hook registry that plugins can use:

```typescript
class HookRegistry {
  on(hookName: string, handler: (context) => Promise<result>)
  emit(hookName: string, context: any): Promise<result>
}
```

### Available Hooks

1. **`auth:oidcLogin`** (called by SSO service)
   - Emitted when OIDC callback received
   - Plugin validates token and fetches groups
   - Plugin returns enriched context

2. **`azure-ad:validateTenant`** (called by plugin)
   - Optional additional tenant validation
   - Can enforce single-tenant policies

3. **`azure-ad:onGroupSync`** (future)
   - Emitted after groups synced
   - Allows custom group handling

## Plugin Discovery

### Plugin Registry

PluginRegistry auto-discovers plugins:

```
1. Scan: apps/server/src/ee/plugins/<plugin-name>/
2. Load: plugin.config.json
3. Validate: Required fields (id, name, version)
4. Load: plugin-config.schema.json
5. Register: In-memory plugin map
```

### Plugin Config

File: `plugin.config.json`

```json
{
  "id": "azure-ad",
  "name": "Azure AD (Entra ID)",
  "version": "1.0.0",
  "hooks": ["auth:oidcLogin", "azure-ad:validateTenant"],
  "configLocation": "security"
}
```

### Plugin Module Registration

File: `plugins.module.ts`

```typescript
@Module({
  imports: [RecaptchaModule, AzureAdModule],  // Auto-imports plugin
  ...
})
export class PluginsModule {}
```

## Error Handling

### Token Validation Errors

| Error | HTTP | Resolution |
|-------|------|-----------|
| Invalid token format | 400 | Token must be valid JWT |
| Invalid signature | 401 | Token not signed by Azure AD |
| Token expired | 401 | User must re-authenticate |
| Invalid issuer | 401 | Token not from configured tenant |
| Invalid audience | 401 | Token not for this application |
| Tenant mismatch | 401 | User from wrong Azure AD tenant |

### Configuration Errors

| Error | HTTP | Resolution |
|-------|------|-----------|
| Invalid tenant ID | 400 | UUID format required |
| Invalid client ID | 400 | UUID format required |
| Missing client secret | 400 | Required field |
| Invalid JSON schema | 400 | Config must match schema |

### Graph API Errors

| Status | Handling |
|--------|----------|
| 429 Rate Limited | Backoff + retry |
| 401 Unauthorized | Access token may have expired |
| 403 Forbidden | Missing Directory.Read.All permission |
| 404 Not Found | User or groups may have been deleted |

### Graceful Degradation

- If group sync fails, login continues without groups
- If Graph API unavailable, auth still succeeds
- Errors logged for admin debugging

## Security Considerations

1. **Token Validation**: Multi-stage validation ensures only legitimate tokens accepted
2. **Secrets Encryption**: Client secrets encrypted at rest in PostgreSQL
3. **Tenant Isolation**: tid claim validated to prevent cross-tenant attacks
4. **HTTPS Required**: All OAuth flows must use HTTPS
5. **Rate Limiting**: API calls rate-limited per user/workspace
6. **Audit Logging**: Config changes and auth events logged

See [SECURITY.md](./SECURITY.md) for detailed security practices.

## Performance Optimization

1. **Token Caching**: Azure JWKS keys cached with 24-hour TTL
2. **Group Caching**: Groups cached per user per session
3. **API Pagination**: Handles next-link pagination from Graph API
4. **Exponential Backoff**: Smart retry logic for rate limiting
5. **Database Indexes**: Optimized queries for group sync

## Testing

### Unit Tests

- AzureAdService: Token validation logic
- GroupSyncService: Role mapping and filtering
- TokenValidationService: JWT verification

### Integration Tests

- OIDC callback flow
- User creation from token
- Group sync and role mapping
- Error handling and recovery

### E2E Tests

- Complete login flow
- Group membership verification
- Configuration testing

See test files in `__tests__/` directory.

## Future Enhancements

1. **SCIM 2.0**: Automated user/group provisioning
2. **Directory Sync Job**: Background periodic sync
3. **Team Creation**: Auto-create workspace teams from Azure AD groups
4. **Conditional Access**: Integrate with Azure AD conditional access
5. **Multi-tenant Support**: Allow multiple Azure AD tenants per workspace

## Related Documentation

- [SETUP.md](./SETUP.md) - Admin setup guide
- [API.md](./API.md) - API reference
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration options
- [SECURITY.md](./SECURITY.md) - Security best practices
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
