# reCAPTCHA v3 Plugin - Discovery & Display Guide

**Status**: ✅ Plugin Discovery Enabled  
**Date**: June 28, 2026

---

## 🔍 How Plugin Discovery Works

### Plugin Registry Scanning

The `PluginRegistry` now scans **2 locations** for plugins:

```
1. External Plugins (User-installed):
   project_root/plugins/[plugin-name]/plugin.config.json

2. Built-in Plugins (Core):
   apps/server/src/ee/plugins/[plugin-name]/plugin.config.json
```

### reCAPTCHA Plugin Location
```
apps/server/src/ee/plugins/recaptcha/
├── plugin.config.json                    ← Plugin metadata
├── plugin-config.schema.json             ← Configuration schema
├── recaptcha.service.ts
├── recaptcha.module.ts
├── hooks/
├── repositories/
└── services/
```

---

## 📋 Plugin Metadata (plugin.config.json)

```json
{
  "id": "recaptcha",
  "name": "reCAPTCHA v3",
  "version": "1.0.0",
  "description": "Score-based bot detection for login and signup using Google reCAPTCHA v3",
  "author": "Docmost",
  "license": "MIT",
  "homepage": "https://developers.google.com/recaptcha/docs/v3",
  "hooks": [
    "auth:beforeLogin",
    "auth:beforeSignup"
  ],
  "configRequired": true,
  "configSchemaFile": "./plugin-config.schema.json"
}
```

---

## 🔧 Configuration Schema (plugin-config.schema.json)

```json
{
  "type": "object",
  "title": "reCAPTCHA v3 Configuration",
  "properties": {
    "siteKey": {
      "type": "string",
      "title": "Site Key",
      "description": "Google reCAPTCHA v3 Site Key (public)",
      "required": true
    },
    "secretKey": {
      "type": "string",
      "title": "Secret Key",
      "description": "Google reCAPTCHA v3 Secret Key (keep secret!)",
      "isSecret": true,
      "required": true
    },
    "actions": {
      "type": "object",
      "properties": {
        "login": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "threshold": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.5 },
            "blockAction": { "type": "string", "enum": ["allow", "challenge", "block"], "default": "challenge" }
          }
        },
        "signup": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "threshold": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.7 },
            "blockAction": { "type": "string", "enum": ["allow", "challenge", "block"], "default": "block" }
          }
        }
      }
    }
  }
}
```

---

## 📱 Plugin Display in UI

### 1. Plugins List Page
**Route**: `/settings/plugins`

Shows:
- ✅ Plugin name: "reCAPTCHA v3"
- ✅ Version: "1.0.0"
- ✅ Description: "Score-based bot detection..."
- ✅ Enable/Disable toggle
- ✅ Configure button (opens modal)

### 2. Plugin Configuration Modal

**Configuration Fields**:
```
┌─────────────────────────────────────┐
│ reCAPTCHA v3 Configuration          │
├─────────────────────────────────────┤
│                                     │
│ Site Key *                          │
│ [____________________________]       │
│ Google reCAPTCHA v3 Site Key (pub)  │
│                                     │
│ Secret Key *                        │
│ [____________________________]       │ ← Masked
│ Google reCAPTCHA v3 Secret Key      │
│                                     │
│ Login Configuration                 │
│  ☑ Enabled                          │
│  Threshold: [0.5___]                │
│  Block Action: ○ Allow ◐ Challenge  │
│                ○ Block              │
│                                     │
│ Signup Configuration                │
│  ☑ Enabled                          │
│  Threshold: [0.7___]                │
│  Block Action: ○ Allow ○ Challenge  │
│                ◐ Block              │
│                                     │
│ [Cancel] [Save Configuration]       │
└─────────────────────────────────────┘
```

---

## 🔄 Plugin Lifecycle

### 1. Server Startup
```
1. PluginRegistry.loadPlugins()
   ├─ Scan: project_root/plugins/
   ├─ Scan: apps/server/src/ee/plugins/
   └─ Load: recaptcha/plugin.config.json
             recaptcha/plugin-config.schema.json

2. PluginRegistry.getAllPlugins()
   └─ Returns: [{ id: 'recaptcha', name: 'reCAPTCHA v3', ... }]

3. PluginsController exposes GET /api/plugins
   └─ Returns plugin list to frontend

4. RecaptchaModule.onModuleInit()
   └─ Register hooks:
      - auth:beforeLogin → BeforeLoginHandler
      - auth:beforeSignup → BeforeSignupHandler
```

### 2. User Opens Plugins Settings
```
1. Frontend: GET /api/plugins
   ↓
2. Backend: PluginsController.getPlugins()
   └─ Returns enriched plugin list with config schema
   
3. Frontend: Displays plugins list with reCAPTCHA

4. User clicks "Configure" button

5. Frontend: GET /api/plugins/recaptcha/config
   ↓
6. Backend: PluginsController.getPluginConfig('recaptcha')
   └─ Returns current configuration or defaults

7. Frontend: Renders configuration modal with schema-based form
```

### 3. User Configures Plugin
```
1. User fills in:
   - siteKey: "6Le..."
   - secretKey: "6Le...secret"
   - Thresholds and actions

2. User clicks "Save Configuration"

3. Frontend: PUT /api/plugins/recaptcha/config
   └─ Payload:
      {
        "enabled": true,
        "config": {
          "siteKey": "6Le...",
          "secretKey": "6Le...secret",
          "actions": { ... }
        }
      }

4. Backend: PluginConfigService.updateConfig('recaptcha')
   ├─ Validate config against schema
   ├─ Encrypt secrets
   ├─ Store in database
   ├─ Log audit event
   └─ Return saved config

5. Frontend: Show success toast
```

### 4. Login/Signup Flow
```
1. User submits login with reCAPTCHA token

2. AuthController.login()
   ├─ Emit hook: auth:beforeLogin
   │  └─ BeforeLoginHandler.handle(context)
   │     ├─ Check if plugin enabled
   │     ├─ Verify token with Google
   │     ├─ Evaluate score
   │     ├─ Log verification
   │     └─ Return modified context
   │
   ├─ Check for MFA requirement
   ├─ Issue JWT token
   └─ Set auth cookie

3. Frontend: Redirect to home or MFA page
```

---

## 🎯 API Endpoints

### Get All Plugins
```bash
GET /api/plugins

Response:
{
  "data": [
    {
      "id": "recaptcha",
      "name": "reCAPTCHA v3",
      "version": "1.0.0",
      "description": "Score-based bot detection...",
      "author": "Docmost",
      "enabled": false,
      "configured": false,
      "hooks": ["auth:beforeLogin", "auth:beforeSignup"]
    }
  ]
}
```

### Get Plugin Details
```bash
GET /api/plugins/recaptcha

Response:
{
  "data": {
    "id": "recaptcha",
    "name": "reCAPTCHA v3",
    "version": "1.0.0",
    "description": "Score-based bot detection...",
    "author": "Docmost",
    "enabled": false,
    "configured": false,
    "hooks": ["auth:beforeLogin", "auth:beforeSignup"],
    "configSchema": { ... }  ← Full JSON schema
  }
}
```

### Get Plugin Configuration
```bash
GET /api/plugins/recaptcha/config

Response:
{
  "data": {
    "id": null,
    "workspaceId": "ws-123",
    "pluginId": "recaptcha",
    "enabled": false,
    "config": {},
    "version": 0
  }
}
```

### Update Plugin Configuration
```bash
PUT /api/plugins/recaptcha/config

Request Body:
{
  "enabled": true,
  "config": {
    "siteKey": "6Le...",
    "secretKey": "6Le...secret",
    "actions": {
      "login": { "enabled": true, "threshold": 0.5, "blockAction": "challenge" },
      "signup": { "enabled": true, "threshold": 0.7, "blockAction": "block" }
    }
  }
}

Response:
{
  "data": {
    "id": "cfg-uuid",
    "workspaceId": "ws-123",
    "pluginId": "recaptcha",
    "enabled": true,
    "config": { ... },
    "version": 1
  }
}
```

### Toggle Plugin
```bash
POST /api/plugins/recaptcha/toggle

Request Body:
{ "enabled": true }

Response:
{
  "data": {
    "success": true,
    "enabled": true
  }
}
```

---

## 🚀 Step-by-Step: Enable reCAPTCHA

### 1. Get reCAPTCHA Keys
Go to https://www.google.com/recaptcha/admin

Create a new site:
- **Label**: "My Docmost Instance"
- **Type**: reCAPTCHA v3
- **Domains**: your-domain.com

Copy:
- **Site Key**: `6Le...`
- **Secret Key**: `6Le...secret`

### 2. Open Plugins Settings
1. Log in to Docmost
2. Go to Settings → Plugins
3. Find "reCAPTCHA v3"
4. Click "Configure"

### 3. Enter reCAPTCHA Keys
```
Site Key:    6Le...
Secret Key:  6Le...secret
```

### 4. Configure Thresholds (Optional)
Default is fine:
- Login threshold: 0.5 (allow uncertain with MFA)
- Signup threshold: 0.7 (block uncertain)

### 5. Save & Enable
1. Click "Save Configuration"
2. Toggle "Enable" switch
3. Done! ✅

---

## 🔍 Troubleshooting

### Plugin Not Appearing in List

**Symptom**: "reCAPTCHA v3" not in plugins list

**Check**:
1. Build successful? `npm run build` ✅
2. Plugin file location correct?
   ```
   apps/server/src/ee/plugins/recaptcha/plugin.config.json ✅
   ```
3. Config has required fields?
   ```json
   {
     "id": "recaptcha",     ✅
     "name": "reCAPTCHA v3", ✅
     "version": "1.0.0"     ✅
   }
   ```
4. Server restarted after build? 
   ```bash
   npm run dev
   ```

**Solution**:
- Check server logs: `npm run dev 2>&1 | grep -i recaptcha`
- Verify files exist: `ls apps/server/src/ee/plugins/recaptcha/`
- Rebuild: `npm run build && npm run dev`

### Configuration Not Saving

**Symptom**: Clicked save but config didn't persist

**Check**:
1. Database migrations run?
   ```bash
   npm run db:migrate
   ```
2. Workspace ID correct?
3. Secret key encrypted?

**Solution**:
- Check error in server console
- Verify database has `plugin_configurations` table
- Retry with valid keys

### Plugin Not Working in Login

**Symptom**: Login works but reCAPTCHA not blocking bots

**Check**:
1. Plugin enabled? ✅
2. Keys valid? ✅
3. Token sent from frontend? (Check browser console)
4. Hook handlers registered? (Check server logs)

**Solution**:
- Verify token in network tab of browser DevTools
- Check server logs for hook execution
- Verify score threshold settings

---

## 📊 Verification Checklist

After enabling plugin, verify:

- [ ] Plugin appears in `/settings/plugins`
- [ ] Can click "Configure" button
- [ ] Configuration form shows all fields
- [ ] Can save configuration
- [ ] Can toggle enable/disable
- [ ] Login form shows reCAPTCHA badge
- [ ] Signup form shows reCAPTCHA badge
- [ ] High-score requests allowed
- [ ] Low-score requests blocked
- [ ] Admin can view verification stats
- [ ] Errors logged to database

---

## 🎯 Next: Frontend Integration

Once plugin is discovered and configured, complete:
1. [Login Form Integration](INTEGRATION_GUIDE.md#2-login-form-integration)
2. [Signup Form Integration](INTEGRATION_GUIDE.md#3-signup-form-integration)
3. [Error Handling UI](INTEGRATION_GUIDE.md#error-handling)

---

**Status**: Plugin discovery ready ✅

Hãy deploy và kiểm tra xem plugin reCAPTCHA có xuất hiện trong danh sách plugins chưa!
