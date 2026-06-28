# Azure AD Plugin Troubleshooting Guide

Common issues, error messages, and solutions.

## Table of Contents

1. [Configuration Issues](#configuration-issues)
2. [Connection Issues](#connection-issues)
3. [Authentication Issues](#authentication-issues)
4. [Group Sync Issues](#group-sync-issues)
5. [General Issues](#general-issues)
6. [Getting Help](#getting-help)

## Configuration Issues

### Issue: "Invalid tenant ID"

**Error Message**:
```
Invalid configuration
Error: Invalid UUID format for tenantId
```

**Cause**: Tenant ID is not in correct UUID format

**Solution**:
1. Get correct tenant ID from Azure Portal
2. Go to Azure AD → Properties
3. Copy "Directory ID" (also called Tenant ID)
4. Format must be: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Example Correct Format**:
```
12345678-1234-1234-1234-123456789012
```

**Common Mistakes**:
- ✗ Using display name instead of ID
- ✗ Spaces or hyphens in wrong places
- ✗ Using tenant name (`tenant.onmicrosoft.com`)
- ✗ Copy-pasting with extra characters

### Issue: "Invalid client ID"

**Error Message**:
```
Invalid configuration
Error: Invalid UUID format for clientId
```

**Cause**: Client ID is not in correct UUID format

**Solution**:
1. Go to Azure Portal → App Registrations → Your App
2. Copy "Application (client) ID"
3. Ensure it's in UUID format

**Note**: May show as "Client ID" or "Application ID" depending on Azure Portal version

### Issue: "Client secret is required"

**Error Message**:
```
Invalid configuration
Error: Client secret is required
```

**Cause**: No client secret provided or it expired

**Solution**:
1. Go to Azure Portal → App Registrations → Your App
2. Click "Certificates & secrets"
3. Check if any secrets exist:
   - If no secrets: Create new secret
   - If secrets exist but expired: Create new secret
4. Copy the secret value (only visible immediately after creation)
5. Paste into Docmost configuration

**Note**: Secret is only visible once. If lost, create new one.

### Issue: "Redirect URI mismatch"

**Error Message During Login**:
```
AADSTS50011: The redirect URI in the request does not match...
```

**Cause**: Redirect URI in Docmost doesn't match what's registered in Azure

**Solution**:
1. Get correct Docmost redirect URI
   - Format: `https://your-instance.docmost.com/auth/sso/azure-ad/callback`
   - Replace `your-instance.docmost.com` with actual domain
2. Go to Azure Portal → App Registrations → Your App
3. Click "Authentication"
4. Under "Redirect URIs", ensure exact match:
   - Protocol: HTTPS (must be HTTPS)
   - Domain: Exact match including subdomain
   - Path: `/auth/sso/azure-ad/callback`

**Common Mistakes**:
- ✗ Using HTTP instead of HTTPS
- ✗ Missing `/callback` path
- ✗ Wrong domain name
- ✗ Extra query parameters
- ✗ Port numbers included

## Connection Issues

### Issue: "Failed to validate Azure AD credentials"

**When**: Clicking "Test Connection" button

**Possible Causes**:
1. Invalid tenant ID
2. Invalid client ID
3. Invalid or expired client secret
4. Network connectivity issue
5. Azure AD service unavailable

**Solution**:
1. Verify all credentials are correct:
   - Tenant ID matches: Azure AD → Properties
   - Client ID matches: App Registration → Overview
   - Client Secret is current: Not expired
2. Check network connectivity:
   ```bash
   curl -I https://login.microsoftonline.com/
   ```
   Should return HTTP 200
3. Try again after a few minutes
4. If problem persists, check Azure Portal status

### Issue: "Failed to fetch JWKS"

**Error Message**:
```
Failed to verify token signature
Unable to fetch JWKS from Azure
```

**Cause**: Cannot reach Azure AD JWKS endpoint

**Possible Reasons**:
1. Network connectivity issue
2. Firewall blocking Azure AD
3. Proxy issues
4. DNS resolution problem

**Solution**:
1. Check network connectivity to Azure:
   ```bash
   curl https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
   ```
   Replace `{tenantId}` with your tenant ID
2. If behind firewall, ensure outbound HTTPS to Azure AD allowed
3. Check proxy settings if using proxy
4. Check DNS resolution:
   ```bash
   nslookup login.microsoftonline.com
   ```

### Issue: "Connection timeout"

**When**: Operations taking longer than expected

**Possible Causes**:
1. Slow network connection
2. Azure AD service slow or degraded
3. Timeout configured too low

**Solution**:
1. Check internet connection
2. Try again (Azure may be temporarily slow)
3. Check Azure status: https://status.azure.com/
4. Increase timeout if necessary (configuration option)

## Authentication Issues

### Issue: "Token issuer does not match"

**Error Message During Login**:
```
UnauthorizedException: Token issuer does not match configured tenant
```

**Cause**: Token is from different Azure AD tenant than configured

**Possible Reasons**:
1. User belongs to different Azure AD tenant
2. Wrong tenant ID configured
3. User has guest access from other tenant

**Solution**:
1. Verify configured tenant ID is correct
2. Check that user logs in with account from correct tenant
3. For multi-tenant scenarios, register app as multi-tenant in Azure Portal

### Issue: "Token audience does not match"

**Error Message During Login**:
```
UnauthorizedException: Token audience does not match client ID
```

**Cause**: Token is not intended for this application

**Possible Reasons**:
1. Client ID in Docmost doesn't match Azure app
2. Token intended for different app
3. Configuration mismatch

**Solution**:
1. Verify client ID in Docmost matches Azure Portal
2. Ensure using correct Azure app (not different app)
3. Check if app requires additional configuration

### Issue: "Token has expired"

**Error Message During Login**:
```
UnauthorizedException: Token has expired
```

**Cause**: Azure AD token is no longer valid

**Normal**: Tokens expire after 1 hour

**Solution**:
1. User needs to log in again
2. Click "Sign in with Azure AD" button
3. This should provide fresh token

**Note**: This is normal behavior. Users must re-authenticate after token expires.

### Issue: "Cannot sign in - error page shows"

**When**: User tries to log in, gets error on Azure login page

**Error Examples**:
- `AADSTS50058: Silent sign-in request failed...`
- `AADSTS65001: User or admin has not consented...`
- `AADSTS700020: Your organization requires...`

**Solution**:
1. Common issue: User needs to grant consent
   - Click through consent screen
   - Administrator may need to grant consent
2. Check Azure AD configuration
   - Verify app permissions are set
   - Verify admin consent if required
3. Check conditional access policies
   - May require MFA
   - May require device compliance
4. Contact Azure AD admin for help

## Group Sync Issues

### Issue: "Groups not syncing"

**When**: Group sync enabled but groups not appearing in Docmost

**Possible Causes**:
1. Group sync not enabled
2. API permission not granted
3. User has no groups assigned
4. Group filtering excluding groups

**Solution**:
1. Verify group sync is enabled:
   - Settings → Security → Azure AD → "Enable group sync" ✓
2. Verify API permissions in Azure:
   - App Registration → API permissions
   - Check for `Directory.Read.All` permission
   - Admin consent granted ✓
3. Check user has groups in Azure:
   - Azure AD → Users → Select user → Groups
   - Should show at least one group
4. Review group filters:
   - If group filters configured, verify groups match
   - Filters are case-sensitive

### Issue: "Failed to fetch user groups"

**Error Message**:
```
Failed to sync groups
Graph API error: 401 Unauthorized
```

**Cause**: Cannot access Microsoft Graph API

**Possible Reasons**:
1. API permission not granted
2. Access token is invalid
3. Permission requires admin consent

**Solution**:
1. Grant API permission in Azure Portal:
   - App Registration → API permissions
   - Add "Directory.Read.All" permission
   - Grant admin consent
2. Check permission grant:
   - Click "Grant admin consent for [organization]"
   - Should show green checkmark
3. Wait a few minutes after granting consent
4. Try login again

### Issue: "Tenant mismatch error"

**Error Message**:
```
Failed to fetch groups
Graph API error: 403 Forbidden
```

**Cause**: Possible permission issue or tenant mismatch

**Solution**:
1. Verify tenant ID is correct
2. Re-grant API permissions:
   - App Registration → API permissions → Add
   - Select "Directory.Read.All"
   - Grant admin consent
3. If using directory/tenant admin account, ensure permissions correct

### Issue: "Groups mapped but roles not applied"

**When**: Groups sync but users don't get expected workspace roles

**Possible Causes**:
1. Group mapping rules not configured
2. Group ID in mapping doesn't match actual group ID
3. User not in mapped groups

**Solution**:
1. Verify group mapping is configured:
   - Settings → Security → Azure AD → Group Mapping
   - Should show at least one mapping
2. Verify group IDs are correct:
   - Azure Portal → Azure AD → Groups
   - Copy correct Group Object ID
   - Check it matches mapping key
3. Verify user is in the group:
   - Azure AD → Users → Select user
   - Click "Groups"
   - Should show groups user belongs to

**Finding Group ID**:
```
Azure Portal → Azure AD → Groups → Select Group → Overview
Copy: Object ID (not Display name)
```

## General Issues

### Issue: "Internal server error"

**Error Message**:
```
500 Internal Server Error
Something went wrong
```

**Cause**: Unexpected server error

**Solution**:
1. Check server logs:
   ```bash
   docker logs docmost-server
   # or
   tail -f /var/log/docmost/server.log
   ```
2. Look for error details (stack trace)
3. Common causes:
   - Database connection issue
   - Configuration incomplete
   - Azure AD service issue

### Issue: "Unauthorized - 403 Forbidden"

**When**: Accessing configuration page

**Cause**: Not admin user

**Solution**:
1. Log in as workspace admin
2. Only admins can configure Azure AD
3. Ask workspace owner to grant admin role

### Issue: "Plugin not found"

**Error Message**:
```
Plugin azure-ad not found
```

**Cause**: Plugin not properly installed or registered

**Solution**:
1. Verify plugin files exist:
   ```
   apps/server/src/ee/plugins/azure-ad/
   ```
2. Restart Docmost server
3. Check server logs for plugin loading errors
4. Reinstall plugin if necessary

### Issue: "Configuration saved but not applied"

**When**: Configuration changes don't take effect

**Solution**:
1. Clear browser cache:
   - Press F12 → Application → Clear cache
   - Or reload page
2. Restart Docmost server
3. Check if configuration actually saved:
   - Log in again
   - Navigate back to settings
   - Verify values are there
4. Check server logs for errors

## Debugging Tips

### Enable Debug Logging

**Environment Variable**:
```bash
DEBUG=docmost:*,azure-ad:*
```

**In Docker**:
```bash
docker run -e DEBUG=docmost:*,azure-ad:* ...
```

**Check Logs**:
```bash
docker logs docmost-server | grep -i azure
```

### Inspect Token (for developers)

Copy ID token and decode at: https://jwt.ms/

**See**:
- Claims in token
- Expiration time
- Issuer
- Audience
- Groups claim

**Warning**: Never paste production tokens in online tools. Use locally if possible.

### Test Endpoints

**Test Configuration API**:
```bash
curl -X GET \
  https://your-instance.docmost.com/api/plugins/azure-ad \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Test Connection**:
```bash
curl -X POST \
  https://your-instance.docmost.com/api/plugins/azure-ad/test-connection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tenantId": "your-tenant-id",
    "clientId": "your-client-id",
    "clientSecret": "your-secret"
  }'
```

### Check Azure Portal

1. **Verify app registration exists**:
   - Azure Portal → App Registrations
   - Search for your app name
   - Should appear in list

2. **Check redirect URI**:
   - App Registration → Authentication
   - Look for redirect URI
   - Should match Docmost URL exactly

3. **Check API permissions**:
   - App Registration → API permissions
   - Should show Directory.Read.All (if group sync enabled)
   - Should show "Admin consent provided"

4. **Check credentials**:
   - App Registration → Certificates & secrets
   - Verify client secret exists and not expired

## Getting Help

### Before Contacting Support

1. **Check this guide** - Most issues are covered
2. **Check logs**:
   ```bash
   docker logs docmost-server | tail -100
   ```
3. **Verify configuration**:
   - Re-enter all credentials carefully
   - Test connection
   - Check Azure Portal settings
4. **Try restarting**:
   ```bash
   docker restart docmost-server
   ```

### Contact Support

**With**:
- Error message (copy-paste)
- Steps to reproduce
- Docmost version
- What you've already tried
- Server logs (relevant parts)
- Configuration (without secrets)

**Channels**:
- Email: support@docmost.io
- GitHub Issues: https://github.com/docmost/docmost/issues
- Documentation: See [README.md](./README.md)

## Related Documentation

- [SETUP.md](./SETUP.md) - Setup guide
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration options
- [SECURITY.md](./SECURITY.md) - Security considerations
- [API.md](./API.md) - API reference
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical details
