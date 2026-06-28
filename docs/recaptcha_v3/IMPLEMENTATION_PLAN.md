# reCAPTCHA v3 Plugin - Implementation Plan

**Duration**: 5 weeks (1 developer)  
**Start After**: Phase 1 (Plugin Management System) completion  
**Status**: Ready for development  

---

## 📊 Overview

```
Week 1: Backend Infrastructure & Service (40 hours)
  ├─ RecaptchaService
  ├─ Token verification
  ├─ Score caching
  └─ Configuration management

Week 2: Hook Integration (32 hours)
  ├─ BEFORE_LOGIN hook
  ├─ BEFORE_SIGNUP hook
  ├─ Decision logic (allow/challenge/block)
  └─ Response handling

Week 3: Frontend Integration (24 hours)
  ├─ Form integration
  ├─ Token collection
  ├─ Error handling
  └─ UI components

Week 4: Database & Logging (16 hours)
  ├─ Verification audit logs
  ├─ Score history tracking
  ├─ Admin analytics
  └─ Migrations

Week 5: Testing & Monitoring (24 hours)
  ├─ Unit tests
  ├─ Integration tests
  ├─ E2E testing
  ├─ Monitoring setup
  └─ Deployment

Total: 136 hours (~34 days)
```

---

## Week 1: Backend Infrastructure

### Day 1-2: RecaptchaService Implementation

**File**: `apps/server/src/ee/plugins/recaptcha/recaptcha.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name)
  private readonly VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

  constructor(private http: HttpService) {}

  async verifyToken(token: string, secretKey: string): Promise<{
    success: boolean
    score: number
    action: string
    challengeTs: Date
    hostname: string
    errorCodes: string[]
  }> {
    try {
      const response = await firstValueFrom(
        this.http.post(this.VERIFY_URL, null, {
          params: {
            secret: secretKey,
            response: token
          }
        })
      )

      const data = response.data
      return {
        success: data.success,
        score: data.score,
        action: data.action,
        challengeTs: new Date(data.challenge_ts),
        hostname: data.hostname,
        errorCodes: data['error-codes'] || []
      }
    } catch (error) {
      this.logger.error('Failed to verify reCAPTCHA token:', error)
      throw error
    }
  }

  async evaluateScore(
    score: number,
    action: string,
    threshold: number
  ): Promise<{
    decision: 'allow' | 'challenge' | 'block'
    confidence: number
    reason: string
  }> {
    if (score >= threshold) {
      return {
        decision: 'allow',
        confidence: score,
        reason: `Score ${score} >= threshold ${threshold}`
      }
    } else if (score >= threshold - 0.2) {
      return {
        decision: 'challenge',
        confidence: 1 - score,
        reason: `Score ${score} between ${threshold - 0.2} and ${threshold}`
      }
    } else {
      return {
        decision: 'block',
        confidence: 1 - score,
        reason: `Score ${score} < ${threshold - 0.2}`
      }
    }
  }
}
```

**Checklist**:
- [ ] Create RecaptchaService
- [ ] Implement token verification
- [ ] Add error handling
- [ ] Add logging
- [ ] Write unit tests (50+ test cases)

### Day 3-4: Configuration & Caching

**File**: `apps/server/src/ee/plugins/recaptcha/recaptcha.config.ts`

```typescript
export interface RecaptchaConfig {
  siteKey: string
  secretKey: string
  enabled: boolean
  actions: {
    [action: string]: {
      enabled: boolean
      threshold: number
      blockAction: 'allow' | 'challenge' | 'block'
    }
  }
}

export const DEFAULT_CONFIG: RecaptchaConfig = {
  siteKey: '',
  secretKey: '',
  enabled: false,
  actions: {
    login: { enabled: true, threshold: 0.5, blockAction: 'challenge' },
    signup: { enabled: true, threshold: 0.7, blockAction: 'block' }
  }
}
```

**Checklist**:
- [ ] Create configuration interface
- [ ] Create defaults
- [ ] Implement config caching
- [ ] Create validation
- [ ] Write config tests

### Day 5: Score Evaluation & Logging

**File**: `apps/server/src/ee/plugins/recaptcha/recaptcha-verification.repo.ts`

```typescript
// Database operations for storing verification logs
export interface RecaptchaVerification {
  id: string
  workspaceId: string
  token: string
  score: number
  action: string
  decision: 'allow' | 'challenge' | 'block'
  userId?: string
  ipAddress: string
  userAgent: string
  createdAt: Date
}
```

**Checklist**:
- [ ] Create database repository
- [ ] Implement verification logging
- [ ] Create audit trail
- [ ] Add indexes for queries
- [ ] Write tests

---

## Week 2: Hook Integration

### Day 1-2: BEFORE_LOGIN Hook

**File**: `apps/server/src/ee/plugins/recaptcha/hooks/before-login.handler.ts`

```typescript
import { Injectable } from '@nestjs/common'
import { RecaptchaService } from '../recaptcha.service'
import { PluginConfigService } from '../../plugin-config/plugin-config.service'

@Injectable()
export class BeforeLoginHandler {
  constructor(
    private recaptcha: RecaptchaService,
    private configService: PluginConfigService
  ) {}

  async handle(context: any) {
    const { loginInput, workspaceId } = context

    // Get plugin config
    const config = await this.configService.getConfig(workspaceId, 'recaptcha')
    if (!config?.enabled) {
      return context
    }

    // Extract token from request
    const token = loginInput.recaptchaToken
    if (!token) {
      throw new Error('reCAPTCHA token required')
    }

    // Verify with Google
    const verification = await this.recaptcha.verifyToken(
      token,
      config.config.secretKey
    )

    // Evaluate score
    const actionConfig = config.config.actions.login
    const evaluation = await this.recaptcha.evaluateScore(
      verification.score,
      'login',
      actionConfig.threshold
    )

    // Handle decision
    if (evaluation.decision === 'block') {
      throw { code: 'BOT_DETECTED', message: 'Bot detection triggered' }
    }

    if (evaluation.decision === 'challenge') {
      context.requiresMfaChallenge = true
    }

    // Log verification
    await this.logVerification({
      workspaceId,
      score: verification.score,
      decision: evaluation.decision,
      action: 'login'
    })

    return context
  }
}
```

**Checklist**:
- [ ] Create BEFORE_LOGIN handler
- [ ] Implement verification flow
- [ ] Add decision logic
- [ ] Register hook
- [ ] Write integration tests

### Day 3-4: BEFORE_SIGNUP Hook

Similar implementation for signup flow with stricter threshold.

**Checklist**:
- [ ] Create BEFORE_SIGNUP handler
- [ ] Implement verification flow
- [ ] Add decision logic
- [ ] Register hook
- [ ] Write integration tests

### Day 5: Hook Registration & Error Handling

**File**: `apps/server/src/ee/plugins/recaptcha/plugin.ts`

```typescript
import { getHookRegistry } from '../../../core/plugins/plugin-hooks'

export async function initializeRecaptchaPlugin() {
  const hooks = getHookRegistry()
  
  hooks.on('auth:beforeLogin', async (context) => {
    // Handle login
  })

  hooks.on('auth:beforeSignup', async (context) => {
    // Handle signup
  })
}
```

**Checklist**:
- [ ] Register all hooks
- [ ] Implement error handling
- [ ] Add fallback logic
- [ ] Add logging
- [ ] Test error scenarios

---

## Week 3: Frontend Integration

### Day 1-2: Form Integration

**File**: `apps/client/src/ee/plugins/recaptcha/recaptcha-provider.tsx`

```typescript
import { useEffect, useState } from 'react'

export function useRecaptcha(siteKey: string) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Load reCAPTCHA script
    const script = document.createElement('script')
    script.src = 'https://www.google.com/recaptcha/api.js?render=' + siteKey
    script.async = true
    document.head.appendChild(script)

    script.onload = () => {
      window.grecaptcha.ready(() => setReady(true))
    }

    return () => document.head.removeChild(script)
  }, [siteKey])

  const getToken = async (action: string) => {
    if (!ready) throw new Error('reCAPTCHA not loaded')
    return await window.grecaptcha.execute(siteKey, { action })
  }

  return { ready, getToken }
}
```

**Checklist**:
- [ ] Create reCAPTCHA provider
- [ ] Load script dynamically
- [ ] Handle initialization
- [ ] Implement error handling
- [ ] Write tests

### Day 3-4: Login/Signup Form Integration

**File**: `apps/client/src/pages/auth/login.tsx` (modify existing)

```typescript
// In login form submission:
const { getToken } = useRecaptcha(siteKey)

const handleSubmit = async (credentials) => {
  try {
    const recaptchaToken = await getToken('login')
    
    const response = await api.post('/auth/login', {
      ...credentials,
      recaptchaToken
    })

    // Handle response
  } catch (error) {
    if (error.code === 'BOT_DETECTED') {
      // Show block message
    } else if (error.code === 'MFA_REQUIRED') {
      // Show MFA challenge
    }
  }
}
```

**Checklist**:
- [ ] Modify login form
- [ ] Modify signup form
- [ ] Add token collection
- [ ] Add error handling
- [ ] Add user feedback

### Day 5: Error Handling & Edge Cases

**Checklist**:
- [ ] Handle script loading failures
- [ ] Handle network errors
- [ ] Handle expired tokens
- [ ] Handle missing config
- [ ] Write error tests

---

## Week 4: Database & Logging

### Day 1-2: Database Schema

**File**: `apps/server/src/ee/plugins/recaptcha/migrations/001-recaptcha-verifications.sql`

```sql
CREATE TABLE recaptcha_verifications (
  id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  token TEXT NOT NULL,
  score DECIMAL(3, 2) NOT NULL,
  action VARCHAR(50) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  user_id UUID REFERENCES users(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recaptcha_workspace ON recaptcha_verifications(workspace_id);
CREATE INDEX idx_recaptcha_action ON recaptcha_verifications(action);
CREATE INDEX idx_recaptcha_decision ON recaptcha_verifications(decision);
CREATE INDEX idx_recaptcha_created ON recaptcha_verifications(created_at);
```

**Checklist**:
- [ ] Create migration file
- [ ] Define table schema
- [ ] Add indexes
- [ ] Test migration

### Day 3: Analytics & Reporting

**File**: `apps/server/src/ee/plugins/recaptcha/recaptcha-analytics.service.ts`

```typescript
export interface RecaptchaAnalytics {
  totalVerifications: number
  blockedCount: number
  challengedCount: number
  allowedCount: number
  averageScore: number
  scoreDistribution: { [range: string]: number }
  actionMetrics: { [action: string]: any }
}

@Injectable()
export class RecaptchaAnalyticsService {
  async getAnalytics(
    workspaceId: string,
    action?: string,
    hoursBack: number = 24
  ): Promise<RecaptchaAnalytics> {
    // Query database and aggregate results
  }
}
```

**Checklist**:
- [ ] Create analytics service
- [ ] Implement queries
- [ ] Add aggregation
- [ ] Write tests

### Day 4-5: Admin Dashboard Components

**File**: `apps/client/src/ee/plugins/recaptcha/components/recaptcha-dashboard.tsx`

```typescript
export function RecaptchaDashboard() {
  const { analytics, loading } = useRecaptchaAnalytics()

  return (
    <div className="grid gap-4">
      <StatCard label="Total Verifications" value={analytics?.totalVerifications} />
      <StatCard label="Blocked" value={analytics?.blockedCount} />
      <StatCard label="Average Score" value={analytics?.averageScore?.toFixed(2)} />
      <ScoreDistributionChart data={analytics?.scoreDistribution} />
      <ActionMetricsTable data={analytics?.actionMetrics} />
    </div>
  )
}
```

**Checklist**:
- [ ] Create dashboard component
- [ ] Add charts and metrics
- [ ] Add filtering
- [ ] Write tests

---

## Week 5: Testing & Monitoring

### Day 1: Unit Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/recaptcha.service.spec.ts`

```typescript
describe('RecaptchaService', () => {
  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      // Test with mock HTTP response
    })

    it('should handle network errors', async () => {
      // Test error handling
    })

    it('should handle invalid tokens', async () => {
      // Test validation
    })
  })

  describe('evaluateScore', () => {
    it('should return allow for high scores', async () => {
      // Test score evaluation
    })

    it('should return challenge for medium scores', async () => {
      // Test threshold logic
    })

    it('should return block for low scores', async () => {
      // Test blocking logic
    })
  })
})
```

**Checklist**:
- [ ] Write service tests (50+ cases)
- [ ] Write handler tests
- [ ] Write repository tests
- [ ] Write analytics tests
- [ ] Achieve 85%+ coverage

### Day 2: Integration Tests

**Checklist**:
- [ ] Test login flow with reCAPTCHA
- [ ] Test signup flow with reCAPTCHA
- [ ] Test error scenarios
- [ ] Test configuration changes
- [ ] Test database logging

### Day 3: E2E Tests

**Checklist**:
- [ ] Test full login flow
- [ ] Test bot detection blocking
- [ ] Test challenge flow
- [ ] Test different score ranges
- [ ] Test UI feedback

### Day 4: Monitoring & Alerts

**File**: `apps/server/src/ee/plugins/recaptcha/recaptcha-monitoring.ts`

```typescript
export async function setupRecaptchaMonitoring() {
  // Set up Prometheus metrics
  const verificationMetric = new Counter({
    name: 'recaptcha_verifications_total',
    labelNames: ['action', 'decision']
  })

  // Set up alert rules
  // - Alert if average score drops below baseline
  // - Alert if block rate exceeds threshold
  // - Alert if verification fails
}
```

**Checklist**:
- [ ] Set up metrics
- [ ] Create alert rules
- [ ] Set up dashboards
- [ ] Configure logging
- [ ] Test monitoring

### Day 5: Documentation & Deployment

**Checklist**:
- [ ] Write deployment guide
- [ ] Create runbooks
- [ ] Document configuration
- [ ] Write rollback procedures
- [ ] Create admin training docs

---

## 📋 Task Checklist

### Backend Services
- [ ] RecaptchaService implementation
- [ ] Configuration management
- [ ] Hook integration (login/signup)
- [ ] Database schema & migrations
- [ ] Analytics service
- [ ] Error handling
- [ ] Logging & audit trail
- [ ] Monitoring setup

### Frontend Components
- [ ] reCAPTCHA provider/hook
- [ ] Form integration
- [ ] Error handling UI
- [ ] Admin dashboard
- [ ] Analytics charts
- [ ] Configuration UI
- [ ] User feedback components

### Testing
- [ ] Unit tests (85%+ coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Error scenario tests
- [ ] Load testing
- [ ] Security tests

### Documentation
- [ ] Implementation guide
- [ ] Deployment guide
- [ ] Admin documentation
- [ ] API documentation
- [ ] Troubleshooting guide
- [ ] Monitoring guide

### Deployment
- [ ] Staging validation
- [ ] Production deployment
- [ ] Rollback procedures
- [ ] Monitoring in production
- [ ] User communication

---

## 🚀 Deployment Strategy

### Phase 1: Staging
1. Deploy to staging environment
2. Run full test suite
3. Validate with test keys
4. Monitor for 48 hours

### Phase 2: Gradual Rollout
1. Deploy to production with feature flag disabled
2. Enable for 10% of users
3. Monitor metrics for 24 hours
4. Increase to 50% if healthy
5. Roll out to 100%

### Phase 3: Monitoring
1. Watch block rates (alert if >10%)
2. Track score distribution
3. Monitor latency impact (<500ms)
4. Check for false positives

---

## ⏰ Timeline Summary

```
Week 1 (40h): Backend infrastructure
Week 2 (32h): Hook integration  
Week 3 (24h): Frontend integration
Week 4 (16h): Database & logging
Week 5 (24h): Testing & monitoring
─────────────────────────────
Total: 136 hours
```

---

**Status**: Ready to implement after Phase 1 ✅

Follow this plan week by week for a structured, testable implementation.
