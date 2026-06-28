# Azure AD (Entra ID) Setup Guide

Complete step-by-step guide to configure Azure AD integration in Docmost.

## Prerequisites

- Access to Azure Portal with permissions to register applications
- Admin access to Docmost workspace
- Understanding of OAuth 2.0 and OpenID Connect

## Step 1: Register Application in Azure Portal

### 1.1 Navigate to Azure AD App Registrations

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Azure Active Directory" in the left sidebar
3. Click "App registrations"
4. Click "New registration"

### 1.2 Configure App Registration

Fill in the registration form:

| Field | Value |
|-------|-------|
| **Name** | Docmost (or your instance name) |
| **Supported account types** | Accounts in this organizational directory only |
| **Redirect URI** | Web → `https://your-instance.docmost.com/auth/sso/azure-ad/callback` |

> **Important**: Replace `your-instance.docmost.com` with your actual Docmost instance URL

Click "Register"

### 1.3 Find Your Credentials

After registration, you'll see the app overview. **Copy and save:**

1. **Tenant ID**: Listed as "Directory (tenant) ID"
   ```
   Example: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

2. **Client ID**: Listed as "Application (client) ID"
   ```
   Example: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

## Step 2: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Under "Client secrets", click **New client secret**
3. Add description (e.g., "Docmost OAuth")
4. Select expiration (recommend 24 months)
5. Click **Add**
6. **Immediately copy the secret value** (you won't be able to see it again)
   ```
   Example: kz8Q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Step 3: Configure API Permissions (For Group Sync)

If you want to sync user groups from Azure AD:

1. In your app, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions**
5. Search for and select:
   - `Directory.Read.All` (required for group sync)
6. Click **Add permissions**
7. Click **Grant admin consent for [your organization]**

> **Note**: This step is required only if you want automatic group membership sync.

## Step 4: Configure Redirect URI

Verify the redirect URI matches exactly:

1. In your app, go to **Authentication**
2. Under "Redirect URIs", ensure you have:
   ```
   https://your-instance.docmost.com/auth/sso/azure-ad/callback
   ```

3. Under "Implicit grant and hybrid flows", check:
   - ✓ ID tokens (used for login)

4. Click **Save**

## Step 5: Configure in Docmost

### 5.1 Navigate to Security Settings

1. Log in to Docmost as workspace admin
2. Go to **Settings** → **Security & SSO**

### 5.2 Create Azure AD Provider

1. Scroll to **Single Sign-On (SSO)** section
2. Click **Create SSO Provider**
3. Select **Azure AD** from the list

### 5.3 Fill Configuration

Fill in the form with credentials from Azure Portal:

| Field | Value |
|-------|-------|
| **Display name** | Azure AD (or your preferred name) |
| **Tenant ID** | From Step 1.3 |
| **Client ID** | From Step 1.3 |
| **Client Secret** | From Step 2 |
| **Enable provider** | ✓ Checked |
| **Allow signup** | ✓ Checked (to allow new users via Azure AD) |
| **Enable group sync** | ✓ Checked (if you completed Step 3) |

### 5.4 Test Connection

1. Click **Test Connection** button
2. If successful, you'll see:
   ```
   ✓ Connection successful!
   Tenant: your-tenant-id
   ```

3. If failed, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### 5.5 Save Configuration

Click **Save** to enable Azure AD authentication.

## Step 6: Configure Group Mapping (Optional)

If you enabled group sync, you can map Azure AD groups to Docmost roles:

1. In the Azure AD settings, scroll to **Group Mapping** (if available)
2. Add mappings:
   ```
   Azure AD Group ID → Docmost Role
   ```

3. Available roles:
   - `workspace-admin` - Full workspace access
   - `workspace-member` - Member access
   - `workspace-viewer` - Read-only access

Example mapping:
```json
{
  "xxxxxxxx-xxxx-xxxx-xxxx-admin-group": "workspace-admin",
  "xxxxxxxx-xxxx-xxxx-xxxx-member-group": "workspace-member"
}
```

## Step 7: Test Login

### 7.1 Test with New User

1. Go to your Docmost login page
2. Look for "Sign in with Azure AD" button
3. Click it
4. Sign in with your Azure AD account
5. Verify you're logged in

### 7.2 Verify Groups (If Enabled)

1. Go to **Settings** → **Members**
2. Find your user
3. Check if groups are correctly assigned
4. Verify workspace role matches your Azure AD group

## Troubleshooting

### Common Issues

**Issue**: "Invalid tenant ID"
- **Solution**: Verify tenant ID format is UUID (8-4-4-4-12 characters)
- **Example**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Issue**: "Connection failed - Invalid credentials"
- **Solution**: Double-check Client ID and Client Secret are correct
- **Solution**: Verify Client Secret hasn't expired (check Azure Portal)

**Issue**: "Redirect URI mismatch"
- **Solution**: Ensure redirect URI in Azure Portal matches exactly:
  ```
  https://your-instance.docmost.com/auth/sso/azure-ad/callback
  ```

**Issue**: "Groups not syncing"
- **Solution**: Verify you completed Step 3 (API permissions)
- **Solution**: Check that "Enable group sync" is toggled on
- **Solution**: Verify user has groups assigned in Azure AD

For more issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Best Practices

1. **Rotate secrets regularly**
   - Create new secret before old one expires
   - Update in Docmost
   - Delete old secret in Azure Portal

2. **Monitor authentication errors**
   - Check Docmost audit logs for failed logins
   - Review Azure sign-in logs in Azure Portal

3. **Test group mappings**
   - Add one mapping at a time
   - Test with a user in that group
   - Verify role is applied correctly

4. **Keep instance URL consistent**
   - Don't change Docmost instance URL after setup
   - If you must change it, update redirect URI in Azure Portal

5. **Use organization policy**
   - Consider enforcing Azure AD login for all users
   - Use conditional access to add extra security

## Security Considerations

- ✓ All credentials encrypted at rest
- ✓ Redirect URI validation prevents attacks
- ✓ Token signatures verified against Azure public keys
- ✓ Token expiry and issuer validated
- ✓ Tenant ID validated to prevent cross-tenant attacks

See [SECURITY.md](./SECURITY.md) for detailed security practices.

## Next Steps

1. **Enable SSO enforcement** (optional)
   - Settings → Security → Enforce single sign-on
   - Prevents password login, forces Azure AD

2. **Set up SCIM** (future - not yet available)
   - Automated user/group provisioning
   - Two-way sync with Azure AD

3. **Configure conditional access** (in Azure AD)
   - Require MFA for Docmost access
   - Restrict access by location
   - Device compliance requirements

## Support

For issues not covered here, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or contact Docmost support.
