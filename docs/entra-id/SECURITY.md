# Azure AD Plugin Security Considerations

Comprehensive security guide for the Azure AD plugin.

## Table of Contents

1. [Token Security](#token-security)
2. [Secrets Management](#secrets-management)
3. [Tenant Isolation](#tenant-isolation)
4. [Network Security](#network-security)
5. [Authorization & Access Control](#authorization--access-control)
6. [API Security](#api-security)
7. [Audit Logging](#audit-logging)
8. [Security Checklist](#security-checklist)
9. [Incident Response](#incident-response)

## Token Security

### JWT Validation

All Azure AD tokens undergo multi-stage validation:

#### 1. Format Validation
- Token must be valid JWT (three base64-encoded parts separated by dots)
- Fails immediately if malformed

#### 2. Signature Verification
- Token signature verified using Azure's public JWKS keys
- JWKS keys fetched from Azure and cached for 24 hours
- Prevents forged or tampered tokens

#### 3. Expiry Check
- `exp` (expiration) claim validated
- Token rejected if current time >= exp time
- Default token lifetime: 1 hour

#### 4. Issuer Validation (configurable)
- `iss` claim must match expected issuer
- Expected: `https://login.microsoftonline.com/{tenantId}/v2.0`
- Prevents tokens from other Azure AD instances
- **Default**: Enabled (highly recommended)

#### 5. Audience Validation (configurable)
- `aud` claim must include configured client ID
- Ensures token is intended for this application
- Prevents token reuse in other applications
- **Default**: Enabled (highly recommended)

#### 6. Tenant Validation
- `tid` claim must match configured tenant ID
- Prevents users from other Azure AD tenants
- Critical for multi-tenant deployments

### Token Flow Security

```
Azure AD Token Endpoint
        ↓
    Token Issued
        ↓
   User Agent
        ↓
   Docmost Backend
        ↓
[Format Check]
[Signature Verify]
[Expiry Check]
[Issuer Validation]
[Audience Validation]
[Tenant Validation]
        ↓
    User Authenticated ✓
```

### JWKS Key Management

**Caching**:
- Azure public keys cached locally
- Cache TTL: 24 hours
- Reduced dependency on Azure AD for validation
- Improves performance

**Key Rotation**:
- Azure rotates keys periodically
- New keys fetched on cache expiry
- Old keys rejected automatically

## Secrets Management

### Client Secret Security

The client secret is the most sensitive credential and must be protected.

#### At Rest
- **Encryption**: AES-256 encryption in PostgreSQL
- **Storage**: `plugin_configurations.config` JSONB column
- **Access**: Only accessible via authenticated API
- **Audit**: All access logged

#### In Transit
- **HTTPS Required**: All API calls must use HTTPS
- **No Logging**: Secrets never logged in application logs
- **API Redaction**: Secrets returned as `***REDACTED***`

#### In Memory
- **Minimal Lifetime**: Loaded only when needed
- **Not Cached**: Fresh from database each use
- **Garbage Collection**: Cleared after use

### Secrets Rotation

**Recommended**: Rotate secrets every 6-12 months

**Rotation Process**:
1. Create new client secret in Azure Portal
2. Update Docmost configuration with new secret
3. Verify login still works
4. Delete old secret in Azure Portal

**Automation** (future):
- Support for rotating secrets automatically
- Integration with Azure Key Vault

### Secrets Handling Best Practices

**Do**:
- ✓ Use strong secrets (Azure generates them)
- ✓ Rotate regularly
- ✓ Store in secure vault
- ✓ Use environment variables in sensitive environments
- ✓ Audit secret access

**Don't**:
- ✗ Commit secrets to version control
- ✗ Share secrets via email or chat
- ✗ Log secrets in application logs
- ✗ Hardcode secrets in configuration files
- ✗ Use predictable or weak secrets

## Tenant Isolation

### Single-Tenant Configuration

Each Docmost workspace is configured for ONE Azure AD tenant.

**Architecture**:
```
Docmost Workspace
    ↓
Plugin Configuration (per workspace)
    ↓
Single Azure AD Tenant
```

### Tenant Validation

Every token's `tid` claim is validated:

```typescript
if (claims.tid !== configuredTenantId) {
  throw new UnauthorizedException("Tenant mismatch")
}
```

**Prevents**:
- Users from other Azure AD tenants logging in
- Cross-tenant token injection attacks
- Unauthorized access to shared infrastructure

### Multi-Workspace Scenario

If you have multiple Docmost workspaces:

**Scenario**: 
- Workspace A: Tenant X
- Workspace B: Tenant Y

**Result**: ✓ Isolated
- Users from Tenant X cannot access Workspace B
- Each workspace has separate user database
- Each workspace has separate configuration

**Consideration**:
- Each workspace requires separate Azure AD app registration
- Each gets unique client ID and secret

## Network Security

### HTTPS Requirement

**Mandatory**: All OAuth flows must use HTTPS

**Why**:
- Protects tokens in transit
- Prevents man-in-the-middle attacks
- Required by OAuth 2.0 specification
- Azure AD enforces HTTPS

**Configuration**:
- Redirect URI must start with `https://`
- Azure Portal rejects non-HTTPS URIs
- Application should enforce HTTPS

### Redirect URI Validation

**Azure Validates**:
- Redirect URI matches registered URI exactly
- Prevents open redirect attacks
- Case-sensitive matching

**Format**:
```
https://your-instance.docmost.com/auth/sso/azure-ad/callback
```

**Must Match**:
- Protocol: HTTPS
- Domain: Exact match
- Path: Exact match
- No query parameters

### Firewall Considerations

**Outbound Rules Needed**:
- Access to `login.microsoftonline.com` (Azure AD)
- Access to `graph.microsoft.com` (Graph API, if group sync enabled)
- Standard HTTPS port 443

**Inbound Rules**:
- Accept OAuth redirects from Azure AD
- Azure AD IP ranges (not needed if using DNS)

## Authorization & Access Control

### Configuration Access

**Who can configure**:
- Workspace admins only
- Checked via JwtAuthGuard + workspace membership

**API Endpoint Protection**:
```typescript
@UseGuards(JwtAuthGuard)
@Put('plugins/azure-ad/config')
async updateConfig(...) { ... }
```

### Plugin Visibility

**Who can see**:
- Workspace admins can view configuration
- Configuration page restricted to admins
- API endpoints return 403 if not admin

### Workspace Isolation

Configuration stored per workspace:
```sql
plugin_configurations(workspace_id, plugin_id)
```

**Effect**:
- Admin in Workspace A cannot see Workspace B's config
- Users cannot see or modify configuration
- Complete isolation between workspaces

## API Security

### Authentication

**All Endpoints** (except public ones) require:
```
Authorization: Bearer <JWT_TOKEN>
```

**Token Validation**:
- JWT must be valid
- Signature verified
- Not expired
- Workspace membership verified

### Rate Limiting

**Endpoints Rate Limited**:
- 100 requests per minute per user
- 1000 requests per minute per workspace

**Headers Returned**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1625097600
```

### Input Validation

**All Inputs Validated**:
- Tenant ID: UUID format
- Client ID: UUID format
- Scopes: Array of strings
- Email domains: Valid domain format

**Invalid Input Rejected**:
```json
{
  "statusCode": 400,
  "message": "Invalid configuration",
  "errors": [
    {"field": "tenantId", "message": "Invalid UUID format"}
  ]
}
```

### Error Messages

**Sensitive Information Not Leaked**:
- ✓ "Invalid credentials"
- ✗ "User not found in Azure AD"
- ✗ "Tenant ID not valid"
- ✗ "Graph API returned 404"

**Detailed Errors in Logs Only**:
- Detailed error messages logged server-side
- Users see generic "Connection failed" message

## Audit Logging

### What's Logged

#### Configuration Changes
- Timestamp of change
- Admin who made change
- What changed (except secrets)
- Old and new values
- Success/failure

**Example Log Entry**:
```
[2026-07-01T12:00:00Z] Azure AD config updated
  - Admin: user@example.com
  - Changes: groupSyncEnabled true → false
  - Status: SUCCESS
```

#### Authentication Events
- Failed login attempts
- Successful logins
- Token validation failures
- Group sync events

**Example Log Entry**:
```
[2026-07-01T13:15:00Z] Azure AD login
  - Email: user@example.com
  - Tenant: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  - Groups synced: 5
  - Status: SUCCESS
```

#### Error Events
- Invalid token errors
- Configuration errors
- API failures
- Network errors

**Example Log Entry**:
```
[2026-07-01T14:30:00Z] Azure AD login failed
  - Error: Token issuer mismatch
  - Expected: tenant-a
  - Got: tenant-b
  - Status: FAILED
```

### Audit Log Access

**Who Can Access**:
- Workspace admins only
- Via audit log API
- Retention: Configurable (default 90 days)

**Format**:
```json
{
  "timestamp": "2026-07-01T12:00:00Z",
  "event": "azure-ad.config.updated",
  "userId": "admin-user-id",
  "workspaceId": "workspace-id",
  "details": {
    "changes": {},
    "before": {},
    "after": {}
  },
  "status": "SUCCESS" | "FAILED",
  "errorMessage": null
}
```

## Security Checklist

### Pre-Deployment

- [ ] Client secret generated in Azure Portal
- [ ] Secret stored securely (not in code)
- [ ] Redirect URI registered in Azure Portal
- [ ] HTTPS enforced on Docmost instance
- [ ] TLS certificate valid and up-to-date
- [ ] API permissions granted in Azure Portal
- [ ] Directory.Read.All permission for group sync

### Post-Deployment

- [ ] Test login with different user types
- [ ] Verify group sync working (if enabled)
- [ ] Check audit logs for any errors
- [ ] Verify token validation working
- [ ] Test with invalid credentials (should fail)
- [ ] Verify secrets are redacted in API

### Ongoing

- [ ] Review audit logs regularly (weekly)
- [ ] Monitor failed login attempts
- [ ] Verify no secrets in logs
- [ ] Plan secret rotation schedule
- [ ] Keep Azure Portal access restricted
- [ ] Review group mappings periodically
- [ ] Monitor Graph API rate limiting
- [ ] Update Docmost to get security patches

### Azure Portal

- [ ] App registration only by authorized admins
- [ ] Limit who can view client secrets
- [ ] Review app permissions regularly
- [ ] Remove unused secrets
- [ ] Monitor sign-in logs for suspicious activity
- [ ] Use conditional access for extra security

## Incident Response

### Security Incident: Suspected Secret Compromise

**Immediate Actions**:
1. Go to Azure Portal → App Registrations
2. Go to Certificates & secrets
3. Delete compromised secret immediately
4. Create new secret
5. Update Docmost configuration
6. Check Azure sign-in logs for suspicious logins

**Investigation**:
1. Review Docmost audit logs for unusual activity
2. Check when secret was last used
3. Who had access to the secret
4. Whether external systems were affected

**Follow-up**:
1. Review secret management practices
2. Implement access controls in Azure Portal
3. Train admins on secret handling
4. Consider using Azure Key Vault

### Security Incident: Unusual Login Activity

**Signs**:
- Spike in failed login attempts
- Logins from unexpected locations
- Users reporting unauthorized access
- Repeated token validation failures

**Response**:
1. Check audit logs for pattern
2. Identify affected users
3. Force users to re-authenticate
4. Review group mappings
5. Check if tenant ID is correct
6. Verify Azure AD security settings

### Reporting Security Issues

**Found a vulnerability?**

Do NOT publicly disclose. Instead:
1. Email security@docmost.io with details
2. Include steps to reproduce
3. Include impact assessment
4. Allow time for patch (typically 30 days)

## Regular Security Reviews

### Monthly

- [ ] Review failed login attempts
- [ ] Check for unusual patterns
- [ ] Verify no secrets leaked

### Quarterly

- [ ] Audit group mappings
- [ ] Review tenant isolation working
- [ ] Check token validation logs
- [ ] Verify HTTPS enforced

### Annually

- [ ] Penetration testing (if supported)
- [ ] Security audit of configuration
- [ ] Review Azure AD security settings
- [ ] Update documentation

## References

- [RFC 6819: OAuth 2.0 Threat Model and Security Considerations](https://tools.ietf.org/html/rfc6819)
- [OpenID Connect Security Best Practices](https://openid.net/specs/openid-connect-core-1_0.html#Security)
- [Microsoft Security Best Practices](https://learn.microsoft.com/en-us/azure/security/fundamentals/best-practices-and-patterns)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## Support

For security concerns, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or contact security@docmost.io.
