# reCAPTCHA v3 Plugin - Testing Guide

**Version**: 1.0  
**Status**: Ready for Phase 2 implementation  

---

## 🧪 Testing Strategy

Testing the reCAPTCHA v3 plugin requires testing at multiple levels:

```
Level 1: Unit Tests (RecaptchaService, utils)
  ↓
Level 2: Integration Tests (Handlers, Database)
  ↓
Level 3: E2E Tests (Full Login/Signup Flows)
  ↓
Level 4: Load Testing (Performance)
  ↓
Level 5: Security Testing (Token validation)
```

---

## 📋 Unit Tests

### 1. RecaptchaService Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/recaptcha.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { RecaptchaService } from '../services/recaptcha.service'
import { of, throwError } from 'rxjs'

describe('RecaptchaService', () => {
  let service: RecaptchaService
  let httpService: HttpService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecaptchaService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn()
          }
        }
      ]
    }).compile()

    service = module.get<RecaptchaService>(RecaptchaService)
    httpService = module.get<HttpService>(HttpService)
  })

  describe('verifyToken', () => {
    it('should verify valid token successfully', async () => {
      // Arrange
      const token = 'valid_token_xyz'
      const secretKey = 'secret_key_123'
      const googleResponse = {
        success: true,
        score: 0.9,
        action: 'login',
        challenge_ts: '2026-06-28T10:00:00Z',
        hostname: 'example.com'
      }

      jest.spyOn(httpService, 'post').mockReturnValue(
        of({ data: googleResponse })
      )

      // Act
      const result = await service.verifyToken(token, secretKey)

      // Assert
      expect(result.success).toBe(true)
      expect(result.score).toBe(0.9)
      expect(result.action).toBe('login')
      expect(httpService.post).toHaveBeenCalledWith(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        {
          params: {
            secret: secretKey,
            response: token
          }
        }
      )
    })

    it('should handle failed verification', async () => {
      // Arrange
      const token = 'invalid_token'
      const googleResponse = {
        success: false,
        'error-codes': ['invalid-input-response']
      }

      jest.spyOn(httpService, 'post').mockReturnValue(
        of({ data: googleResponse })
      )

      // Act & Assert
      const result = await service.verifyToken(token, 'secret')
      expect(result.success).toBe(false)
      expect(result.errorCodes).toContain('invalid-input-response')
    })

    it('should handle network errors', async () => {
      // Arrange
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => new Error('Network error'))
      )

      // Act & Assert
      await expect(
        service.verifyToken('token', 'secret')
      ).rejects.toThrow('Network error')
    })

    it('should handle missing secret key', async () => {
      // Arrange
      const googleResponse = {
        success: false,
        'error-codes': ['missing-input-secret']
      }

      jest.spyOn(httpService, 'post').mockReturnValue(
        of({ data: googleResponse })
      )

      // Act
      const result = await service.verifyToken('token', '')

      // Assert
      expect(result.errorCodes).toContain('missing-input-secret')
    })

    it('should timeout on slow responses', async () => {
      // Arrange
      jest.spyOn(httpService, 'post').mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(of({ data: { success: true, score: 0.9 } }))
          }, 10000)
        })
      })

      // Act & Assert
      await expect(
        Promise.race([
          service.verifyToken('token', 'secret'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ])
      ).rejects.toThrow('Timeout')
    })
  })

  describe('evaluateScore', () => {
    it('should return allow for high scores', async () => {
      // Act
      const result = await service.evaluateScore(0.9, 'login', 0.5)

      // Assert
      expect(result.decision).toBe('allow')
      expect(result.confidence).toBe(0.9)
    })

    it('should return challenge for medium scores', async () => {
      // Act
      const result = await service.evaluateScore(0.55, 'login', 0.5)

      // Assert
      expect(result.decision).toBe('challenge')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should return block for low scores', async () => {
      // Act
      const result = await service.evaluateScore(0.2, 'login', 0.5)

      // Assert
      expect(result.decision).toBe('block')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should handle edge case: score exactly at threshold', async () => {
      // Act
      const result = await service.evaluateScore(0.5, 'login', 0.5)

      // Assert
      expect(result.decision).toBe('allow')
    })

    it('should handle edge case: score at challenge boundary', async () => {
      // threshold = 0.5, boundary = 0.3 (threshold - 0.2)
      // Act
      const result = await service.evaluateScore(0.3, 'login', 0.5)

      // Assert
      expect(result.decision).toBe('challenge')
    })

    it('should work with strict thresholds (signup)', async () => {
      // Act
      const result = await service.evaluateScore(0.65, 'signup', 0.7)

      // Assert
      expect(result.decision).toBe('challenge')
    })

    it('should validate score range 0-1', async () => {
      // Act & Assert
      expect(() => service.evaluateScore(-0.1, 'login', 0.5)).toThrow()
      expect(() => service.evaluateScore(1.1, 'login', 0.5)).toThrow()
    })
  })
})
```

### 2. Configuration Validation Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/config.spec.ts`

```typescript
describe('reCAPTCHA Configuration', () => {
  describe('validateConfig', () => {
    it('should accept valid configuration', () => {
      const config = {
        siteKey: 'valid-site-key',
        secretKey: 'valid-secret-key',
        enabled: true,
        actions: {
          login: {
            enabled: true,
            threshold: 0.5,
            blockAction: 'challenge'
          }
        }
      }

      expect(() => validateConfig(config)).not.toThrow()
    })

    it('should reject missing site key', () => {
      const config = {
        secretKey: 'key',
        enabled: true
      }

      expect(() => validateConfig(config)).toThrow('Missing siteKey')
    })

    it('should reject missing secret key', () => {
      const config = {
        siteKey: 'key',
        enabled: true
      }

      expect(() => validateConfig(config)).toThrow('Missing secretKey')
    })

    it('should reject invalid threshold', () => {
      const config = {
        siteKey: 'key',
        secretKey: 'key',
        enabled: true,
        actions: {
          login: {
            threshold: 1.5  // Out of range
          }
        }
      }

      expect(() => validateConfig(config)).toThrow('Threshold must be 0-1')
    })

    it('should have reasonable defaults', () => {
      const config = getDefaultConfig()

      expect(config.enabled).toBe(false)
      expect(config.actions.login.threshold).toBe(0.5)
      expect(config.actions.signup.threshold).toBe(0.7)
    })
  })
})
```

---

## 🔗 Integration Tests

### 1. Handler Integration Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/before-login.handler.spec.ts`

```typescript
describe('BeforeLoginHandler', () => {
  let handler: BeforeLoginHandler
  let recaptchaService: RecaptchaService
  let configService: PluginConfigService
  let verificationRepo: RecaptchaVerificationRepo

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BeforeLoginHandler,
        {
          provide: RecaptchaService,
          useValue: {
            verifyToken: jest.fn(),
            evaluateScore: jest.fn()
          }
        },
        {
          provide: PluginConfigService,
          useValue: {
            getConfig: jest.fn()
          }
        },
        {
          provide: RecaptchaVerificationRepo,
          useValue: {
            create: jest.fn()
          }
        }
      ]
    }).compile()

    handler = module.get(BeforeLoginHandler)
    recaptchaService = module.get(RecaptchaService)
    configService = module.get(PluginConfigService)
    verificationRepo = module.get(RecaptchaVerificationRepo)
  })

  it('should allow high-score requests', async () => {
    // Arrange
    const context = {
      loginInput: {
        email: 'user@example.com',
        password: 'password',
        recaptchaToken: 'token_xyz'
      },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: true,
      config: {
        secretKey: 'secret',
        actions: {
          login: { enabled: true, threshold: 0.5, blockAction: 'challenge' }
        }
      }
    })

    jest.spyOn(recaptchaService, 'verifyToken').mockResolvedValue({
      success: true,
      score: 0.95,
      action: 'login',
      challengeTs: new Date(),
      hostname: 'example.com',
      errorCodes: []
    })

    jest.spyOn(recaptchaService, 'evaluateScore').mockResolvedValue({
      decision: 'allow',
      confidence: 0.95,
      reason: 'Score above threshold'
    })

    // Act
    const result = await handler.handle(context)

    // Assert
    expect(result).toEqual(context)
    expect(result.requiresMfaChallenge).toBeUndefined()
    expect(verificationRepo.create).toHaveBeenCalled()
  })

  it('should require MFA for uncertain scores', async () => {
    // Arrange
    const context = {
      loginInput: {
        email: 'user@example.com',
        password: 'password',
        recaptchaToken: 'token_xyz'
      },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: true,
      config: {
        secretKey: 'secret',
        actions: {
          login: { enabled: true, threshold: 0.5 }
        }
      }
    })

    jest.spyOn(recaptchaService, 'verifyToken').mockResolvedValue({
      success: true,
      score: 0.55,
      action: 'login',
      challengeTs: new Date(),
      hostname: 'example.com',
      errorCodes: []
    })

    jest.spyOn(recaptchaService, 'evaluateScore').mockResolvedValue({
      decision: 'challenge',
      confidence: 0.45,
      reason: 'Score between threshold and boundary'
    })

    // Act
    const result = await handler.handle(context)

    // Assert
    expect(result.requiresMfaChallenge).toBe(true)
  })

  it('should block low-score requests', async () => {
    // Arrange
    const context = {
      loginInput: {
        email: 'bot@example.com',
        password: 'password',
        recaptchaToken: 'token_xyz'
      },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: true,
      config: {
        secretKey: 'secret',
        actions: {
          login: { enabled: true, threshold: 0.5 }
        }
      }
    })

    jest.spyOn(recaptchaService, 'verifyToken').mockResolvedValue({
      success: true,
      score: 0.1,
      action: 'login',
      challengeTs: new Date(),
      hostname: 'example.com',
      errorCodes: []
    })

    jest.spyOn(recaptchaService, 'evaluateScore').mockResolvedValue({
      decision: 'block',
      confidence: 0.9,
      reason: 'Score below block threshold'
    })

    // Act & Assert
    await expect(handler.handle(context)).rejects.toThrow('bot')
  })

  it('should skip verification if plugin disabled', async () => {
    // Arrange
    const context = {
      loginInput: { email: 'user@example.com', password: 'password' },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: false
    })

    // Act
    const result = await handler.handle(context)

    // Assert
    expect(result).toEqual(context)
    expect(recaptchaService.verifyToken).not.toHaveBeenCalled()
  })

  it('should handle missing token gracefully', async () => {
    // Arrange
    const context = {
      loginInput: { email: 'user@example.com', password: 'password' },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: true,
      config: {
        actions: { login: { enabled: true } }
      }
    })

    // Act & Assert
    await expect(handler.handle(context)).rejects.toThrow('token required')
  })

  it('should handle verification failures gracefully', async () => {
    // Arrange
    const context = {
      loginInput: {
        email: 'user@example.com',
        password: 'password',
        recaptchaToken: 'bad_token'
      },
      workspaceId: 'ws-123'
    }

    jest.spyOn(configService, 'getConfig').mockResolvedValue({
      enabled: true,
      config: {
        secretKey: 'secret',
        actions: { login: { enabled: true } }
      }
    })

    jest.spyOn(recaptchaService, 'verifyToken').mockRejectedValue(
      new Error('Network error')
    )

    // Act
    const result = await handler.handle(context)

    // Assert
    expect(result.requiresMfaChallenge).toBe(true)  // Fallback: require MFA
  })
})
```

### 2. Database Integration Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/verification.repo.spec.ts`

```typescript
describe('RecaptchaVerificationRepo', () => {
  let repo: RecaptchaVerificationRepo
  let db: Kysely<any>

  beforeEach(async () => {
    // Setup test database
    db = createTestDatabase()
    repo = new RecaptchaVerificationRepo(db)
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should create verification log', async () => {
    // Arrange
    const verification = {
      workspaceId: 'ws-123',
      token: 'token_xyz',
      score: 0.9,
      action: 'login',
      decision: 'allow',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...'
    }

    // Act
    const result = await repo.create(verification)

    // Assert
    expect(result.id).toBeDefined()
    expect(result.score).toBe(0.9)
    expect(result.decision).toBe('allow')
  })

  it('should query verifications by workspace', async () => {
    // Arrange
    await repo.create({
      workspaceId: 'ws-123',
      token: 'token_1',
      score: 0.9,
      action: 'login',
      decision: 'allow'
    })

    await repo.create({
      workspaceId: 'ws-456',
      token: 'token_2',
      score: 0.2,
      action: 'login',
      decision: 'block'
    })

    // Act
    const results = await repo.findByWorkspace('ws-123')

    // Assert
    expect(results).toHaveLength(1)
    expect(results[0].token).toBe('token_1')
  })

  it('should calculate statistics', async () => {
    // Arrange
    await repo.create({
      workspaceId: 'ws-123',
      score: 0.9,
      decision: 'allow'
    })
    await repo.create({
      workspaceId: 'ws-123',
      score: 0.2,
      decision: 'block'
    })

    // Act
    const stats = await repo.getStatistics('ws-123')

    // Assert
    expect(stats.totalCount).toBe(2)
    expect(stats.blockedCount).toBe(1)
    expect(stats.averageScore).toBe(0.55)
  })
})
```

---

## 🏁 End-to-End Tests

### 1. Login Flow E2E Test

**File**: `apps/e2e/login-with-recaptcha.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Login with reCAPTCHA', () => {
  test('should allow legitimate users', async ({ page }) => {
    // Go to login page
    await page.goto('/login')

    // Wait for reCAPTCHA to load
    await page.waitForFunction(
      () => typeof window.grecaptcha !== 'undefined'
    )

    // Fill in credentials
    await page.fill('input[type="email"]', 'valid@example.com')
    await page.fill('input[type="password"]', 'correctpassword123')

    // Submit form (reCAPTCHA will be collected automatically)
    await page.click('button[type="submit"]')

    // Should redirect to home
    await expect(page).toHaveURL('/home')
  })

  test('should block obvious bots', async ({ page }) => {
    // Arrange: Mock reCAPTCHA to return low score
    await page.goto('/login')

    // Mock the grecaptcha execution to return a token that scores low
    await page.evaluate(() => {
      window.grecaptcha.execute = async () => 'low_score_token'
    })

    // Fill credentials
    await page.fill('input[type="email"]', 'bot@example.com')
    await page.fill('input[type="password"]', 'password')

    // Submit
    await page.click('button[type="submit"]')

    // Should show error
    await expect(page.locator('text=bot detected')).toBeVisible()
  })

  test('should require MFA for uncertain scores', async ({ page }) => {
    // Setup: Mock medium score
    await page.goto('/login')

    await page.evaluate(() => {
      window.grecaptcha.execute = async () => 'uncertain_token'
    })

    // Login
    await page.fill('input[type="email"]', 'uncertain@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.click('button[type="submit"]')

    // Should redirect to MFA
    await expect(page).toHaveURL('/login/mfa')
  })
})
```

### 2. Signup Flow E2E Test

**File**: `apps/e2e/signup-with-recaptcha.spec.ts`

```typescript
test.describe('Signup with reCAPTCHA', () => {
  test('should allow legitimate signups', async ({ page }) => {
    await page.goto('/signup')

    // Wait for reCAPTCHA
    await page.waitForFunction(() => typeof window.grecaptcha !== 'undefined')

    // Fill form
    await page.fill('input[placeholder="Name"]', 'John Doe')
    await page.fill('input[type="email"]', 'newuser@example.com')
    await page.fill('input[type="password"]', 'SecurePass123!')

    // Submit
    await page.click('button:has-text("Sign Up")')

    // Should redirect to login with success message
    await expect(page).toHaveURL('/login')
    await expect(page.locator('text=signup successful')).toBeVisible()
  })

  test('should block bot signups more aggressively', async ({ page }) => {
    await page.goto('/signup')

    // Mock low score for signup (stricter than login)
    await page.evaluate(() => {
      window.grecaptcha.execute = async () => 'bot_token'
    })

    await page.fill('input[placeholder="Name"]', 'Bot Name')
    await page.fill('input[type="email"]', 'bot@example.com')
    await page.fill('input[type="password"]', 'password')

    await page.click('button:has-text("Sign Up")')

    // Should show blocking message
    await expect(page.locator('text=blocked')).toBeVisible()
  })
})
```

---

## 📊 Load Testing

### Locust Load Test

**File**: `apps/e2e/load_tests/recaptcha_load.py`

```python
from locust import HttpUser, task, between
import random

class RecaptchaUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """Login at start of test"""
        self.token = self.get_recaptcha_token()

    def get_recaptcha_token(self):
        """Simulate getting reCAPTCHA token"""
        return f"token_{random.randint(1000, 9999)}"

    @task(3)
    def login_legitimate(self):
        """Simulate legitimate login (70% of traffic)"""
        token = self.get_recaptcha_token()
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": "user@example.com",
                "password": "password",
                "recaptchaToken": token
            }
        )
        assert response.status_code in [200, 403], \
            f"Unexpected status: {response.status_code}"

    @task(1)
    def login_bot(self):
        """Simulate bot login (30% of traffic)"""
        # Bot would use invalid tokens
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": "bot@example.com",
                "password": "password",
                "recaptchaToken": "invalid_token_" + str(random.randint(1, 100))
            }
        )
        # Expect 403 or 400
        assert response.status_code in [400, 403]
```

**Run the load test**:
```bash
locust -f apps/e2e/load_tests/recaptcha_load.py \
  -H http://localhost:3000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m
```

---

## 🔐 Security Testing

### Token Validation Tests

**File**: `apps/server/src/ee/plugins/recaptcha/__tests__/security.spec.ts`

```typescript
describe('Security Tests', () => {
  it('should not accept tamperedtokens', async () => {
    // Arrange
    const tamperedToken = 'eyJ...[modified payload]'

    jest.spyOn(httpService, 'post').mockReturnValue(
      of({ data: { success: false, 'error-codes': ['invalid-input-response'] } })
    )

    // Act & Assert
    const result = await service.verifyToken(tamperedToken, 'secret')
    expect(result.success).toBe(false)
  })

  it('should not accept expired tokens', async () => {
    // Arrange
    const expiredToken = 'old_token_from_2_minutes_ago'

    jest.spyOn(httpService, 'post').mockReturnValue(
      of({
        data: {
          success: false,
          'error-codes': ['timeout-or-duplicate']
        }
      })
    )

    // Act
    const result = await service.verifyToken(expiredToken, 'secret')

    // Assert
    expect(result.success).toBe(false)
  })

  it('should validate hostname', async () => {
    // Arrange
    const response = {
      success: true,
      score: 0.9,
      hostname: 'malicious.com'  // Wrong domain
    }

    // Act & Assert
    expect(() => validateHostname(response, 'example.com')).toThrow()
  })

  it('should validate action', async () => {
    // Arrange
    const response = {
      success: true,
      score: 0.9,
      action: 'checkout'  // Expected 'login'
    }

    // Act & Assert
    expect(() => validateAction(response, 'login')).toThrow()
  })

  it('should not accept secrets exposed in logs', async () => {
    // Act
    const service = new RecaptchaService(httpService)

    // Assert: Check that secrets aren't logged
    // Mock logger and verify secret key never appears
    const logSpy = jest.spyOn(console, 'log')

    service.verifyToken('token', 'super_secret_key_12345')

    const logs = logSpy.mock.calls.map(call => call.join(''))
    expect(logs.join('')).not.toContain('super_secret_key_12345')
  })
})
```

---

## ✅ Testing Checklist

### Unit Tests
- [ ] RecaptchaService token verification
- [ ] Score evaluation algorithm
- [ ] Configuration validation
- [ ] Error handling
- [ ] Edge cases (score boundaries)
- [ ] 85%+ code coverage

### Integration Tests
- [ ] BeforeLoginHandler with real config
- [ ] BeforeSignupHandler with real config
- [ ] Database logging
- [ ] Hook registration
- [ ] Error recovery
- [ ] Configuration reload

### E2E Tests
- [ ] Complete login flow
- [ ] Complete signup flow
- [ ] Bot detection blocking
- [ ] MFA challenge flow
- [ ] Error messages
- [ ] UI functionality

### Load Testing
- [ ] 100 concurrent users
- [ ] Token generation performance
- [ ] Verification latency (<500ms)
- [ ] Error rates under load
- [ ] Database throughput

### Security Testing
- [ ] Token validation
- [ ] Secret protection
- [ ] Hostname validation
- [ ] Action validation
- [ ] No token leakage in logs

---

## 🧬 Test Data

### Test Score Values

```json
{
  "very_likely_human": 0.95,
  "likely_human": 0.75,
  "uncertain": 0.55,
  "likely_bot": 0.25,
  "very_likely_bot": 0.05
}
```

### Test Credentials

```json
{
  "legitimate_user": {
    "email": "valid@example.com",
    "password": "ValidPassword123!",
    "expectedScore": 0.9
  },
  "new_signup": {
    "email": "newuser@example.com",
    "password": "NewUserPass123!",
    "expectedScore": 0.8
  },
  "suspicious_pattern": {
    "email": "suspicious@example.com",
    "password": "CommonPassword123",
    "expectedScore": 0.3
  },
  "obvious_bot": {
    "email": "bot@example.com",
    "password": "password",
    "expectedScore": 0.1
  }
}
```

---

## 📈 Test Coverage Goals

```
Target Coverage: 85%+

Backend:
  - Services: 90%
  - Handlers: 85%
  - Repositories: 85%
  - Controllers: 80%

Frontend:
  - Hooks: 80%
  - Components: 75%
```

---

**Status**: Testing guide ready for implementation ✅

Use these tests to ensure the reCAPTCHA v3 plugin works reliably across all scenarios.
