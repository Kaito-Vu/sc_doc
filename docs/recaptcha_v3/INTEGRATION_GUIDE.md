# reCAPTCHA v3 Plugin - Integration Guide

**Version**: 1.0  
**Status**: Ready for Phase 2 implementation  

---

## 🎯 Overview

This guide explains how to integrate the reCAPTCHA v3 plugin into your authentication flows. It covers both backend (NestJS) and frontend (React) implementations.

---

## 🔧 Backend Integration

### 1. Auth Controller Setup

The auth controller needs to emit hooks that the reCAPTCHA plugin subscribes to.

**File**: `apps/server/src/core/auth/auth.controller.ts`

```typescript
import { Controller, Post, Body } from '@nestjs/common'
import { HookRegistry } from '@/core/plugins/plugin-hooks'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private hookRegistry: HookRegistry
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // Step 1: Create context for hooks
    const context = {
      loginInput: loginDto,
      workspaceId: loginDto.workspaceId || 'default',
      remoteAddress: request.ip,
      userAgent: request.get('User-Agent')
    }

    // Step 2: Emit BEFORE_LOGIN hook
    // The reCAPTCHA plugin's handler will:
    // - Extract recaptchaToken from loginInput
    // - Verify it with Google
    // - Evaluate the score
    // - Log the verification
    // - Modify context if needed (e.g., requiresMfaChallenge)
    await this.hookRegistry.emit('auth:beforeLogin', context)

    // Step 3: Handle MFA requirement (if set by plugin)
    if (context.requiresMfaChallenge) {
      return {
        success: false,
        requiresMfa: true,
        message: 'Multi-factor authentication required'
      }
    }

    // Step 4: Proceed with normal login
    const user = await this.authService.validateCredentials(
      loginDto.email,
      loginDto.password
    )

    // Step 5: Emit AFTER_LOGIN hook
    await this.hookRegistry.emit('auth:afterLogin', {
      user,
      loginInput: loginDto
    })

    // Step 6: Return authentication result
    const token = await this.authService.generateToken(user)
    return {
      success: true,
      token,
      user
    }
  }

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    // Similar pattern for signup
    const context = {
      signupInput: signupDto,
      workspaceId: signupDto.workspaceId || 'default'
    }

    // Emit BEFORE_SIGNUP hook
    await this.hookRegistry.emit('auth:beforeSignup', context)

    // If blocked by reCAPTCHA
    if (context.blocked) {
      return {
        success: false,
        error: 'Signup blocked due to bot detection'
      }
    }

    // Proceed with signup
    const user = await this.authService.createUser(signupDto)

    await this.hookRegistry.emit('auth:afterSignup', { user })

    return {
      success: true,
      user
    }
  }
}
```

### 2. Hook Context Interface

**File**: `apps/server/src/core/plugins/hook-context.ts`

```typescript
export interface LoginHookContext {
  loginInput: {
    email: string
    password: string
    recaptchaToken?: string  // Added by reCAPTCHA plugin
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
  
  // Modified by plugins
  requiresMfaChallenge?: boolean
  blocked?: boolean
}

export interface SignupHookContext {
  signupInput: {
    email: string
    password: string
    name: string
    recaptchaToken?: string  // Added by reCAPTCHA plugin
  }
  workspaceId: string
  remoteAddress?: string
  userAgent?: string
  
  // Modified by plugins
  blocked?: boolean
}
```

### 3. Plugin Handler Implementation

**File**: `apps/server/src/ee/plugins/recaptcha/hooks/before-login.handler.ts`

```typescript
import { Injectable, HttpException } from '@nestjs/common'
import { RecaptchaService } from '../services/recaptcha.service'
import { PluginConfigService } from '../../services/plugin-config.service'
import { RecaptchaVerificationRepo } from '../repositories/recaptcha-verification.repo'
import { LoginHookContext } from '@/core/plugins/hook-context'

@Injectable()
export class BeforeLoginHandler {
  constructor(
    private recaptcha: RecaptchaService,
    private configService: PluginConfigService,
    private verificationRepo: RecaptchaVerificationRepo
  ) {}

  async handle(context: LoginHookContext): Promise<LoginHookContext> {
    try {
      const { loginInput, workspaceId } = context

      // 1. Get plugin config
      const pluginConfig = await this.configService.getConfig(
        workspaceId,
        'recaptcha'
      )

      // 2. Check if plugin is enabled
      if (!pluginConfig || !pluginConfig.enabled) {
        return context
      }

      // 3. Get action-specific config
      const actionConfig = pluginConfig.config.actions?.login
      if (!actionConfig || !actionConfig.enabled) {
        return context
      }

      // 4. Check for reCAPTCHA token
      const token = loginInput.recaptchaToken
      if (!token) {
        throw new HttpException('reCAPTCHA token required', 400)
      }

      // 5. Verify token with Google
      const verification = await this.recaptcha.verifyToken(
        token,
        pluginConfig.config.secretKey
      )

      // 6. Evaluate score
      const evaluation = await this.recaptcha.evaluateScore(
        verification.score,
        'login',
        actionConfig.threshold
      )

      // 7. Log verification to database
      await this.verificationRepo.create({
        workspaceId,
        token,
        score: verification.score,
        action: 'login',
        decision: evaluation.decision,
        decisionReason: evaluation.reason,
        ipAddress: context.remoteAddress,
        userAgent: context.userAgent,
        challengeTs: verification.challengeTs
      })

      // 8. Handle decision
      switch (evaluation.decision) {
        case 'allow':
          // Allowed - continue normally
          return context

        case 'challenge':
          // Require MFA challenge
          context.requiresMfaChallenge = true
          return context

        case 'block':
          // Block the attempt
          throw new HttpException(
            'Your request was identified as a bot',
            403
          )
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      
      // Log unexpected errors but don't block
      console.error('reCAPTCHA verification error:', error)
      
      // Fallback: require MFA for safety
      context.requiresMfaChallenge = true
      return context
    }
  }
}
```

### 4. Before Signup Handler

**File**: `apps/server/src/ee/plugins/recaptcha/hooks/before-signup.handler.ts`

```typescript
@Injectable()
export class BeforeSignupHandler {
  // Similar implementation to BeforeLoginHandler
  // but with stricter threshold (0.7 instead of 0.5)
  
  async handle(context: SignupHookContext): Promise<SignupHookContext> {
    // ... similar logic ...
    
    // Key difference: signup has stricter threshold
    const actionConfig = pluginConfig.config.actions?.signup
    // Default threshold for signup: 0.7 (vs 0.5 for login)
    
    // More aggressive blocking for signup
    if (evaluation.decision !== 'allow') {
      throw new HttpException(
        'Signup blocked - please try again later',
        403
      )
    }
    
    return context
  }
}
```

---

## 🎨 Frontend Integration

### 1. reCAPTCHA Provider Hook

**File**: `apps/client/src/ee/plugins/recaptcha/hooks/use-recaptcha.ts`

```typescript
import { useEffect, useState } from 'react'

interface RecaptchaConfig {
  siteKey: string
  enabled: boolean
}

export function useRecaptcha(siteKey: string) {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!siteKey) {
      setLoading(false)
      return
    }

    // Create and load script
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
    script.async = true

    script.onload = () => {
      window.grecaptcha?.ready(() => {
        setReady(true)
        setLoading(false)
      })
    }

    script.onerror = () => {
      setError('Failed to load reCAPTCHA')
      setLoading(false)
    }

    document.head.appendChild(script)

    return () => {
      // Cleanup
      document.head.removeChild(script)
    }
  }, [siteKey])

  const getToken = async (action: string = 'submit'): Promise<string> => {
    if (!ready) {
      throw new Error('reCAPTCHA not ready')
    }

    try {
      const token = await window.grecaptcha.execute(siteKey, { action })
      return token
    } catch (err) {
      setError('Failed to generate reCAPTCHA token')
      throw err
    }
  }

  return {
    ready,
    loading,
    error,
    getToken
  }
}
```

### 2. Login Form Integration

**File**: `apps/client/src/pages/auth/login.tsx` (modify existing)

```typescript
import { useState } from 'react'
import { useRecaptcha } from '@/ee/plugins/recaptcha/hooks/use-recaptcha'
import api from '@/lib/api-client'

interface LoginFormData {
  email: string
  password: string
  recaptchaToken?: string  // Will be populated by reCAPTCHA
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requiresMfa, setRequiresMfa] = useState(false)

  // Initialize reCAPTCHA (get siteKey from config)
  const { getToken: getReCaptchaToken, loading: recaptchaLoading } = 
    useRecaptcha(CONFIG.RECAPTCHA_SITE_KEY)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Step 1: Get reCAPTCHA token
      let recaptchaToken = undefined
      if (!recaptchaLoading && CONFIG.RECAPTCHA_SITE_KEY) {
        try {
          recaptchaToken = await getReCaptchaToken('login')
        } catch (err) {
          console.warn('Failed to get reCAPTCHA token:', err)
          // Continue without token - server will reject if required
        }
      }

      // Step 2: Send login request with reCAPTCHA token
      const response = await api.post('/auth/login', {
        email,
        password,
        recaptchaToken
      })

      // Step 3: Handle response
      if (response.data.requiresMfa) {
        setRequiresMfa(true)
        // Redirect to MFA page
        navigate('/login/mfa')
      } else if (response.data.token) {
        // Login successful
        localStorage.setItem('token', response.data.token)
        navigate('/home')
      }
    } catch (err: any) {
      // Step 4: Handle errors
      if (err.response?.data?.code === 'BOT_DETECTED') {
        setError(
          'Your request was identified as a bot. ' +
          'If you believe this is an error, please try again later.'
        )
      } else if (err.response?.status === 403) {
        setError('Invalid email or password')
      } else {
        setError(err.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        disabled={loading || recaptchaLoading}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        disabled={loading || recaptchaLoading}
      />
      {error && <div className="error">{error}</div>}
      <button 
        type="submit" 
        disabled={loading || recaptchaLoading}
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  )
}
```

### 3. Signup Form Integration

**File**: `apps/client/src/pages/auth/signup.tsx` (modify existing)

```typescript
export function SignupPage() {
  // Similar pattern to login
  const { getToken: getReCaptchaToken } = 
    useRecaptcha(CONFIG.RECAPTCHA_SITE_KEY)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      // Get reCAPTCHA token for signup
      const recaptchaToken = await getReCaptchaToken('signup')

      // Send signup request
      const response = await api.post('/auth/signup', {
        email,
        password,
        name,
        recaptchaToken
      })

      if (response.data.success) {
        // Signup successful
        navigate('/login')
      }
    } catch (err: any) {
      if (err.response?.data?.code === 'BOT_DETECTED') {
        setError(
          'Your signup was blocked due to security checks. ' +
          'Please try again in a few minutes.'
        )
      } else {
        setError(err.message)
      }
    }
  }

  // ... rest of form ...
}
```

---

## 📊 Score Interpretation & Thresholds

### Default Thresholds

```typescript
const ACTION_THRESHOLDS = {
  login: {
    threshold: 0.5,
    description: 'Allow uncertain users with MFA challenge',
    decisions: {
      0.9: 'allow',      // Very likely human
      0.7: 'allow',      // Likely human
      0.5: 'challenge',  // Uncertain - require MFA
      0.3: 'block',      // Likely bot
      0.0: 'block'       // Definitely bot
    }
  },
  
  signup: {
    threshold: 0.7,
    description: 'Block uncertain users - stricter for new accounts',
    decisions: {
      0.9: 'allow',      // Very likely human
      0.7: 'allow',      // Just passing
      0.5: 'block',      // Below threshold
      0.0: 'block'       // Definitely bot
    }
  },
  
  checkout: {
    threshold: 0.8,
    description: 'Very strict for transactions',
    decisions: {
      0.9: 'allow',      // Very likely human
      0.8: 'allow',      // Just passing
      0.7: 'block',      // Below threshold
      0.0: 'block'       // Definitely bot
    }
  }
}
```

### Adaptive Configuration

Admins can adjust thresholds based on their use case:

```json
{
  "login": {
    "enabled": true,
    "threshold": 0.4,
    "blockAction": "challenge"
  },
  "signup": {
    "enabled": true,
    "threshold": 0.6,
    "blockAction": "block"
  }
}
```

---

## 🔄 MFA Challenge Flow

When reCAPTCHA detects uncertainty (score between threshold - 0.2 and threshold):

```
1. Frontend: User submits login form
   ↓
2. Backend: Verifies with reCAPTCHA
   ↓
3. reCAPTCHA: Returns score 0.55 (threshold is 0.5)
   ↓
4. Handler: Decision = 'challenge'
   ↓
5. Context: requiresMfaChallenge = true
   ↓
6. Backend: Returns { requiresMfa: true }
   ↓
7. Frontend: Redirects to /login/mfa
   ↓
8. User: Completes MFA challenge
   ↓
9. Success: User logged in
```

---

## 🚨 Error Handling

### User-Facing Errors

```typescript
// Bot detection
if (error.code === 'BOT_DETECTED') {
  return 'Your request appears to be automated. Please try again later.'
}

// Missing token
if (error.code === 'MISSING_TOKEN') {
  return 'Security verification failed. Please refresh and try again.'
}

// Verification failed
if (error.code === 'VERIFICATION_FAILED') {
  return 'Unable to verify security. Please try again.'
}

// Server error
if (error.code === 'SERVER_ERROR') {
  return 'An error occurred. Please try again later.'
}
```

### Admin Logs

All verifications are logged to `recaptcha_verifications` table:

```sql
SELECT 
  score,
  decision,
  action,
  created_at,
  ip_address,
  COUNT(*) as count
FROM recaptcha_verifications
WHERE workspace_id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY score, decision, action, created_at
ORDER BY created_at DESC
```

---

## 📈 Monitoring & Alerts

### Dashboard Metrics

Create a monitoring dashboard showing:

```
1. Verification Metrics
   - Total verifications (24h)
   - Blocked verifications
   - Challenge verifications
   - Average score

2. Score Distribution
   - 0-0.2: Very likely bot
   - 0.2-0.4: Likely bot
   - 0.4-0.6: Uncertain
   - 0.6-0.8: Likely human
   - 0.8-1.0: Very likely human

3. Action Metrics
   - Login success rate
   - Signup success rate
   - Block rate per action

4. Performance
   - Verification latency (p50, p99)
   - Google API response time
   - Error rate
```

### Alert Conditions

```typescript
// Alert if block rate too high
if (blockCount / totalCount > 0.15) {
  alert('High block rate detected - possible attack or configuration issue')
}

// Alert if average score drops
if (avgScore < baselineScore - 0.2) {
  alert('Average score below baseline - possible attack pattern')
}

// Alert on verification failures
if (verificationFailures > 10) {
  alert('Multiple verification failures - check Google API')
}

// Alert on unusual patterns
if (scoreDistribution['0-0.2'] > expectedCount * 3) {
  alert('Unusual score distribution - possible attack')
}
```

---

## 🔧 Configuration Best Practices

### Per-Environment Configuration

**Development**:
```json
{
  "siteKey": "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
  "secretKey": "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe",
  "actions": {
    "login": { "enabled": true, "threshold": 0.1 },
    "signup": { "enabled": true, "threshold": 0.1 }
  }
}
```

**Staging**:
```json
{
  "siteKey": "staging-site-key",
  "secretKey": "staging-secret-key",
  "actions": {
    "login": { "enabled": true, "threshold": 0.4 },
    "signup": { "enabled": true, "threshold": 0.6 }
  }
}
```

**Production**:
```json
{
  "siteKey": "prod-site-key",
  "secretKey": "prod-secret-key",
  "actions": {
    "login": { "enabled": true, "threshold": 0.5 },
    "signup": { "enabled": true, "threshold": 0.7 }
  }
}
```

### Testing Different Scores

For development, test with different scores:

```typescript
// Mock mode for testing (development only)
const mockScores = {
  'human@example.com': 0.95,        // Very likely human
  'uncertain@example.com': 0.55,    // Uncertain
  'bot@example.com': 0.2             // Likely bot
}

// In verification logic:
if (process.env.NODE_ENV === 'development' && mockScores[email]) {
  verification.score = mockScores[email]
}
```

---

## ✅ Integration Checklist

### Backend Setup
- [ ] Add CoreHooks enum with auth hooks
- [ ] Create LoginHookContext and SignupHookContext interfaces
- [ ] Emit hooks from AuthController
- [ ] Implement BeforeLoginHandler
- [ ] Implement BeforeSignupHandler
- [ ] Create RecaptchaService
- [ ] Create verification repository
- [ ] Set up database logging
- [ ] Create configuration schema
- [ ] Write tests for handlers

### Frontend Setup
- [ ] Create useRecaptcha hook
- [ ] Integrate with login form
- [ ] Integrate with signup form
- [ ] Add error handling UI
- [ ] Add loading states
- [ ] Test with real reCAPTCHA keys
- [ ] Test bot detection flow
- [ ] Test MFA challenge flow

### Admin Configuration
- [ ] Create admin UI for plugin configuration
- [ ] Add threshold adjustment UI
- [ ] Create analytics dashboard
- [ ] Set up monitoring alerts
- [ ] Create admin documentation

### Testing
- [ ] Unit tests for service
- [ ] Integration tests for handlers
- [ ] E2E tests for login/signup
- [ ] Load testing
- [ ] Security testing

---

**Status**: Integration guide ready for implementation ✅

Follow these patterns to successfully integrate reCAPTCHA v3 into your authentication flows.
