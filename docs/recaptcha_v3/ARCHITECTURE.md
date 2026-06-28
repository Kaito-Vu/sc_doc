# reCAPTCHA v3 Plugin - Architecture

**Version**: 1.0  
**Status**: Design document for Phase 2 implementation  

---

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌──────────────────┐        ┌──────────────────┐             │
│  │   Login Form     │        │   Signup Form    │             │
│  └────────┬─────────┘        └────────┬─────────┘             │
│           │                           │                        │
│           └───────────┬───────────────┘                        │
│                       ▼                                         │
│           ┌────────────────────────┐                          │
│           │  RecaptchaProvider     │                          │
│           │  (useRecaptcha hook)   │                          │
│           └───────────┬────────────┘                          │
│                       │                                        │
│         ┌─────────────┴─────────────┐                         │
│         ▼                           ▼                         │
│    Load Script               Execute grecaptcha.execute()     │
│    (from Google)             (generates token)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HTTP Request with Token                      │
│                      (e.g., /api/login)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (NestJS)                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Auth Controller                                │  │
│  │  - Receives login/signup request with recaptchaToken    │  │
│  │  - Emits BEFORE_LOGIN/BEFORE_SIGNUP hook               │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │        Hook Registry (from Phase 1)                      │  │
│  │  - Manages hook subscribers                              │  │
│  │  - Executes RecaptchaBeforeLoginHandler                 │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │   RecaptchaBeforeLoginHandler (Hook Handler)            │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │ 1. Extract token from request context            │   │  │
│  │  │ 2. Check if plugin enabled via config            │   │  │
│  │  │ 3. Call RecaptchaService.verifyToken()           │   │  │
│  │  │ 4. Call RecaptchaService.evaluateScore()         │   │  │
│  │  │ 5. Log verification to database                  │   │  │
│  │  │ 6. Return context or throw error                 │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│  ┌──────────────────▼─────────────────────────────────────┐  │
│  │    RecaptchaService (Core Service)                     │  │
│  │                                                        │  │
│  │  verifyToken(token, secret)                           │  │
│  │  ├─ Call Google siteverify API                        │  │
│  │  ├─ Validate response                                 │  │
│  │  └─ Return { success, score, action, ... }           │  │
│  │                                                        │  │
│  │  evaluateScore(score, action, threshold)              │  │
│  │  ├─ Compare score against threshold                   │  │
│  │  ├─ Return decision: allow | challenge | block       │  │
│  │  └─ Include confidence and reason                     │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│     ┌───────────────┴──────────────────┬─────────────┐         │
│     ▼                                  ▼             ▼         │
│ Google API                      Database          Config       │
│ (siteverify)                    (Audit logs)      Service      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Plugin Structure

```
apps/server/src/ee/plugins/recaptcha/
├── plugin.ts                          # Plugin entry point
├── plugin.config.json                 # Plugin metadata
├── plugin-config.schema.json           # Configuration schema
│
├── services/
│   ├── recaptcha.service.ts           # Core verification logic
│   ├── recaptcha-analytics.service.ts # Analytics queries
│   └── recaptcha-monitoring.service.ts # Monitoring setup
│
├── hooks/
│   ├── before-login.handler.ts        # BEFORE_LOGIN hook
│   ├── before-signup.handler.ts       # BEFORE_SIGNUP hook
│   └── hook-registry.service.ts       # Hook registration
│
├── repositories/
│   └── recaptcha-verification.repo.ts # Database operations
│
├── entities/
│   ├── recaptcha-verification.entity.ts
│   └── recaptcha-config.entity.ts
│
├── dto/
│   ├── verify-token.dto.ts
│   └── evaluation-result.dto.ts
│
├── controllers/
│   └── recaptcha-admin.controller.ts  # Admin API endpoints
│
├── migrations/
│   ├── 001-recaptcha-verifications.sql
│   └── 002-recaptcha-analytics-view.sql
│
├── __tests__/
│   ├── recaptcha.service.spec.ts
│   ├── hooks/
│   │   └── before-login.handler.spec.ts
│   └── repositories/
│       └── recaptcha-verification.repo.spec.ts
│
└── module.ts                          # NestJS module definition

apps/client/src/ee/plugins/recaptcha/
├── hooks/
│   └── use-recaptcha.ts               # React hook
│
├── providers/
│   └── recaptcha-provider.tsx          # Script loading provider
│
├── services/
│   └── recaptcha-api.ts               # API client
│
├── components/
│   ├── recaptcha-badge.tsx            # Google badge
│   ├── recaptcha-error.tsx            # Error component
│   └── recaptcha-loading.tsx           # Loading state
│
└── __tests__/
    └── use-recaptcha.spec.ts
```

---

## 🔄 Data Flow Diagrams

### Login Flow with reCAPTCHA

```
User
  │
  ├─ Enters email/password
  │
  ▼
Frontend (Login Form)
  │
  ├─ grecaptcha.ready()
  │
  ├─ grecaptcha.execute('siteKey', { action: 'login' })
  │  └─ Returns: recaptchaToken
  │
  ▼
POST /api/login
{
  email: 'user@example.com',
  password: 'password',
  recaptchaToken: 'token_xyz...'
}
  │
  ▼
AuthController.login()
  │
  ├─ Extract token from request.body.recaptchaToken
  │
  ├─ Emit BEFORE_LOGIN hook with context
  │
  ▼
HookRegistry.executeHook('BEFORE_LOGIN')
  │
  ▼
RecaptchaBeforeLoginHandler
  │
  ├─ Check if plugin enabled
  │
  ├─ Call RecaptchaService.verifyToken(token)
  │  │
  │  ├─ POST to Google siteverify
  │  │  └─ Returns: { success, score, action, ... }
  │  │
  │  └─ Validate response
  │
  ├─ Call RecaptchaService.evaluateScore(score)
  │  │
  │  ├─ Compare score vs threshold (0.5 for login)
  │  │
  │  └─ Decision: allow | challenge | block
  │      - 0.5+: ALLOW ✅
  │      - 0.3-0.5: CHALLENGE (require MFA)
  │      - <0.3: BLOCK ❌
  │
  ├─ Log verification to database
  │  └─ INSERT recaptcha_verifications(...)
  │
  ├─ Modify context based on decision
  │  └─ context.requiresMfaChallenge = true (if challenge)
  │
  └─ Return context or throw BOT_DETECTED error
      │
      ▼
AuthController.login() continues
  │
  ├─ If error: return 403 Forbidden
  │
  ├─ If allow: proceed with login
  │
  └─ If challenge: redirect to MFA
      │
      ▼
Frontend
  │
  ├─ If error: show "Bot detected" message
  │
  ├─ If allow: redirect to home
  │
  └─ If challenge: show MFA setup
```

### Signup Flow (Stricter)

```
Similar to login, but:
  - Threshold: 0.7 (stricter than login 0.5)
  - Blocks more aggressively
  - May require CAPTCHA for lower scores
```

---

## 🔌 Hook Integration Points

### Phase 1 (Existing Plugin Management)

The plugin system from Phase 1 provides:

```typescript
// Core interface (apps/server/src/core/plugins/plugin-hooks.ts)
export enum CoreHooks {
  BEFORE_LOGIN = 'auth:beforeLogin',
  AFTER_LOGIN = 'auth:afterLogin',
  BEFORE_SIGNUP = 'auth:beforeSignup',
  AFTER_SIGNUP = 'auth:afterSignup'
}

export interface HookRegistry {
  on(hook: string, handler: HookHandler): void
  emit(hook: string, context: any): Promise<void>
}
```

### Phase 2 (reCAPTCHA Plugin)

Registers handlers:

```typescript
// apps/server/src/ee/plugins/recaptcha/hooks/hook-registry.service.ts

export class RecaptchaHookRegistry {
  constructor(
    private hooks: HookRegistry,
    private recaptchaService: RecaptchaService,
    private handler: RecaptchaBeforeLoginHandler
  ) {}

  register() {
    this.hooks.on(CoreHooks.BEFORE_LOGIN, async (context) => {
      return this.handler.handle(context)
    })

    this.hooks.on(CoreHooks.BEFORE_SIGNUP, async (context) => {
      return this.handler.handle(context)
    })
  }
}
```

---

## 🗄️ Database Schema

### Verifications Table

```sql
CREATE TABLE recaptcha_verifications (
  id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Token & Verification Data
  token TEXT NOT NULL,
  score DECIMAL(3, 2) NOT NULL CHECK (score >= 0 AND score <= 1),
  action VARCHAR(50) NOT NULL,  -- login, signup, checkout, etc.
  
  -- Decision
  decision VARCHAR(20) NOT NULL,  -- allow, challenge, block
  decision_reason TEXT,
  
  -- User Context
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT now(),
  challenge_ts TIMESTAMPTZ,
  
  -- Audit
  INDEX_workspce idx_recaptcha_workspace (workspace_id),
  INDEX_action idx_recaptcha_action (action),
  INDEX_decision idx_recaptcha_decision (decision),
  INDEX_created idx_recaptcha_created (created_at),
  INDEX_user idx_recaptcha_user (user_id, workspace_id)
);
```

### Configuration Storage

Stored in plugin_configurations table (from Phase 1):

```typescript
{
  workspaceId: 'ws-123',
  pluginId: 'recaptcha',
  enabled: true,
  config: {
    siteKey: 'public-key-here',
    secretKey: 'secret-key-here',  // Encrypted in database
    actions: {
      login: {
        enabled: true,
        threshold: 0.5,
        blockAction: 'challenge'
      },
      signup: {
        enabled: true,
        threshold: 0.7,
        blockAction: 'block'
      }
    }
  }
}
```

---

## ⚙️ Configuration Management

### Plugin Discovery (Phase 1)

```
PluginManager scans: apps/server/src/ee/plugins/*/
  ├─ reads plugin.config.json
  ├─ reads plugin-config.schema.json
  └─ returns plugin metadata
```

### Plugin Configuration UI

The admin interface (Phase 1) provides:
- List view of installed plugins
- Enable/disable toggle
- Configuration modal with dynamic form
- Config validation against schema

### reCAPTCHA Schema

```json
{
  "type": "object",
  "properties": {
    "siteKey": {
      "type": "string",
      "title": "Google reCAPTCHA Site Key",
      "required": true
    },
    "secretKey": {
      "type": "string",
      "title": "Google reCAPTCHA Secret Key",
      "isSecret": true,
      "required": true
    },
    "actions": {
      "type": "object",
      "properties": {
        "login": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean" },
            "threshold": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "default": 0.5
            },
            "blockAction": {
              "type": "string",
              "enum": ["allow", "challenge", "block"],
              "default": "challenge"
            }
          }
        }
      }
    }
  }
}
```

---

## 🔐 Error Handling Strategy

### Error Classification

```typescript
interface VerificationError {
  code: ErrorCode
  message: string
  recoverable: boolean
  userMessage: string
  logLevel: 'info' | 'warn' | 'error'
}

enum ErrorCode {
  // Token errors
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  
  // Configuration errors
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // Network errors
  GOOGLE_API_ERROR = 'GOOGLE_API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // Verification errors
  BOT_DETECTED = 'BOT_DETECTED',
  INVALID_SCORE = 'INVALID_SCORE',
  
  // Plugin errors
  PLUGIN_DISABLED = 'PLUGIN_DISABLED'
}
```

### Fallback Strategy

```typescript
// If verification fails and plugin is optional
if (error.recoverable) {
  // Log but allow request to proceed
  // Alert admin
  // Set flag for monitoring
  return context  // Continue without reCAPTCHA
}

// If verification fails critically
if (!error.recoverable) {
  // Throw error
  // Block request
  // Alert admin immediately
  throw error
}
```

---

## 📊 Monitoring Architecture

### Metrics Collection

```typescript
interface RecaptchaMetrics {
  // Counters
  total_verifications: Counter
  successful_verifications: Counter
  failed_verifications: Counter
  blocked_verifications: Counter
  
  // Gauges
  average_score: Gauge
  current_block_rate: Gauge
  
  // Histograms
  verification_latency: Histogram
  score_distribution: Histogram
  
  // Summaries
  plugin_performance: Summary
}
```

### Alert Rules

```yaml
alert: HighBlockRate
  expr: recaptcha_blocked_total > threshold
  for: 5m

alert: LowAverageScore
  expr: recaptcha_average_score < baseline
  for: 10m

alert: GoogleAPIErrors
  expr: recaptcha_google_errors_total > 5
  for: 1m

alert: HighLatency
  expr: recaptcha_latency_p99 > 500ms
```

---

## 🔄 Request/Response Flow

### Request from Frontend

```typescript
// Frontend sends:
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "recaptchaToken": "10000000-aaaa-bbbb-cccc-000000000001|...long token..."
}
```

### Backend Processing

```typescript
// AuthController receives:
@Post('/login')
async login(@Body() loginDto: LoginDto) {
  // loginDto.recaptchaToken is available
  
  // Emit hook
  const context = { loginInput: loginDto, workspaceId }
  await this.hookRegistry.emit(CoreHooks.BEFORE_LOGIN, context)
  
  // If hook modifies context, handle accordingly
  if (context.requiresMfaChallenge) {
    // Require MFA
  }
  
  // Continue normal login
}
```

### Response to Frontend

```typescript
// Success (allowed):
{
  "data": {
    "success": true,
    "token": "jwt_token_here"
  }
}

// Challenge (MFA required):
{
  "error": {
    "code": "MFA_REQUIRED",
    "message": "Multi-factor authentication required"
  }
}

// Blocked:
{
  "error": {
    "code": "BOT_DETECTED",
    "message": "Your request was identified as a bot"
  }
}
```

---

## 🔒 Security Considerations

### Secret Management

```
Google Secret Key (never exposed to frontend)
  │
  ├─ Stored in environment variable: RECAPTCHA_SECRET_KEY
  │
  ├─ Encrypted in database (plugin_configurations table)
  │
  ├─ Accessed only via server-side code
  │
  └─ Rotated periodically via Google Console
```

### Token Validation

```typescript
// Backend verifies:
1. Token exists and is not empty
2. Token format is valid
3. Challenge timestamp is recent (<2 minutes)
4. Hostname matches configured domain
5. Action matches expected action
6. Score is in valid range (0-1)
```

### Rate Limiting

```
Per IP: 100 verifications per minute
Per User: 10 verifications per 5 minutes
Global: 1M per month (Google free tier)
```

---

## 🔗 Integration with Phase 1 Plugin System

### Plugin Discovery

Phase 1's PluginManager scans and loads the plugin:

```typescript
// Discovered at startup:
{
  id: 'recaptcha',
  name: 'reCAPTCHA v3',
  version: '1.0.0',
  description: 'Score-based bot detection for login/signup',
  author: 'Docmost',
  hooks: ['auth:beforeLogin', 'auth:beforeSignup'],
  configSchema: {...},
  configRequired: true
}
```

### Hook Registration

When plugin is enabled, it registers handlers via HookRegistry:

```typescript
// On module init:
@Module({
  imports: [...]
})
export class RecaptchaModule implements OnModuleInit {
  constructor(private hookRegistry: RecaptchaHookRegistry) {}
  
  async onModuleInit() {
    this.hookRegistry.register()
  }
}
```

---

## 🚀 Deployment Architecture

### Development Environment

```
Docker Compose:
  - Docmost Server (with plugin loaded)
  - PostgreSQL
  - reCAPTCHA test keys in .env
```

### Staging Environment

```
- Real reCAPTCHA keys (staging keys)
- Full monitoring enabled
- Audit logging to database
- Alerts configured
```

### Production Environment

```
- Production reCAPTCHA keys
- Load balancing across instances
- Monitoring & alerting
- Gradual rollout (10% → 50% → 100%)
- Rollback procedure ready
```

---

## 📈 Performance Considerations

### Latency Budget

```
Total request time: <500ms
  ├─ Frontend token generation: 50-200ms
  ├─ Network: 50-100ms
  ├─ Backend verification: 100-200ms
  └─ Database logging: 10-50ms
```

### Caching Strategy

```
Don't cache:
  - Verification results (each token is unique)
  - Google API responses (not safe)

Do cache:
  - Plugin configuration (60 seconds)
  - Action thresholds (60 seconds)
```

---

## 🧪 Testing Architecture

### Unit Tests

```
- RecaptchaService (token verification logic)
- Score evaluation algorithm
- Configuration validation
- Error handling
```

### Integration Tests

```
- Plugin registration with hook system
- Login flow with reCAPTCHA
- Configuration persistence
- Database logging
```

### E2E Tests

```
- Full login flow
- Signup flow
- Admin configuration
- Score-based decision making
```

---

**Status**: Architecture approved for implementation ✅

All components are designed to integrate seamlessly with Phase 1's plugin management system.
