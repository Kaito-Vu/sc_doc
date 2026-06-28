# reCAPTCHA v3 Plugin - Deployment Guide

**Version**: 1.0  
**Status**: Ready for Phase 2 implementation  

---

## 🚀 Deployment Overview

```
Development (Local)
        ↓
    Testing
        ↓
Staging (Test Keys)
        ↓
Production (Real Keys)
        ↓
Monitoring & Alerts
```

---

## 1️⃣ Development Environment Setup

### 1.1 Get Test Keys

Google provides test keys that always return consistent scores.

**reCAPTCHA Test Keys** (use for development):
```
Site Key: 6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
Secret Key: 6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe

These keys ALWAYS return:
- success: true
- score: 0.9 (human-like)
- Cannot test different scores
```

### 1.2 Local Environment Variables

**File**: `.env.local`

```bash
# reCAPTCHA Configuration (Development)
RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe

# Plugin Configuration
PLUGIN_RECAPTCHA_ENABLED=true
PLUGIN_RECAPTCHA_THRESHOLD_LOGIN=0.1
PLUGIN_RECAPTCHA_THRESHOLD_SIGNUP=0.1

# Logging
RECAPTCHA_LOG_LEVEL=debug
```

### 1.3 Docker Compose Setup

**File**: `docker-compose.dev.yml`

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://docmost:password@postgres:5432/docmost
      RECAPTCHA_SITE_KEY: ${RECAPTCHA_SITE_KEY}
      RECAPTCHA_SECRET_KEY: ${RECAPTCHA_SECRET_KEY}
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: docmost
      POSTGRES_PASSWORD: password
      POSTGRES_DB: docmost
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

**Start development environment**:
```bash
# Copy test keys to .env
cp .env.example .env.local

# Start containers
docker-compose -f docker-compose.dev.yml up -d

# Run migrations
npm run db:migrate

# Start dev server
npm run dev
```

### 1.4 Testing Different Scores (Development)

For testing different score scenarios without real reCAPTCHA:

**File**: `apps/server/src/ee/plugins/recaptcha/services/recaptcha.mock.ts`

```typescript
// Use only in development
const MOCK_SCORES = {
  'human@test.com': 0.95,
  'uncertain@test.com': 0.55,
  'bot@test.com': 0.1
}

export class MockRecaptchaService implements RecaptchaService {
  async verifyToken(token: string, secretKey: string) {
    const email = token.split(':')[1] // Parse email from token

    if (MOCK_SCORES[email]) {
      return {
        success: true,
        score: MOCK_SCORES[email],
        action: 'login',
        challengeTs: new Date(),
        hostname: 'localhost',
        errorCodes: []
      }
    }

    return {
      success: true,
      score: 0.5,
      action: 'login',
      challengeTs: new Date(),
      hostname: 'localhost',
      errorCodes: []
    }
  }

  async evaluateScore(score: number, action: string, threshold: number) {
    // Same logic as real service
    if (score >= threshold) {
      return { decision: 'allow', confidence: score, reason: 'Mock allow' }
    }
    return { decision: 'block', confidence: 1 - score, reason: 'Mock block' }
  }
}

// In module:
@Module({
  providers: [
    {
      provide: RecaptchaService,
      useClass: process.env.NODE_ENV === 'development'
        ? MockRecaptchaService
        : RealRecaptchaService
    }
  ]
})
```

**Test with mock tokens**:
```bash
# Email: human@test.com | Token: mock:human@test.com
# Email: bot@test.com | Token: mock:bot@test.com
```

---

## 2️⃣ Staging Environment Setup

### 2.1 Create Google Cloud Project

```bash
# 1. Go to Google Cloud Console
# https://console.cloud.google.com/

# 2. Create new project
gcloud projects create recaptcha-staging --name="Docmost reCAPTCHA Staging"

# 3. Enable reCAPTCHA API
gcloud services enable recaptchaenterprise.googleapis.com --project=recaptcha-staging

# 4. Set as current project
gcloud config set project recaptcha-staging
```

### 2.2 Create reCAPTCHA Keys (Staging)

```bash
# Go to reCAPTCHA Admin Console
# https://www.google.com/recaptcha/admin

# 1. Click "Create" or "+" button
# 2. Fill in details:

Label: Docmost Staging
reCAPTCHA type: reCAPTCHA v3

# 3. Add domains:
Domains:
  staging.example.com
  localhost

# 4. Save and copy keys:
Site Key: 6Le...staging...
Secret Key: 6Le...staging...secret...
```

### 2.3 Staging Environment Variables

**File**: `.env.staging`

```bash
# reCAPTCHA Configuration (Staging)
RECAPTCHA_SITE_KEY=6Le...staging...
RECAPTCHA_SECRET_KEY=6Le...staging...secret...

# Plugin Configuration (Staging - Real Thresholds)
PLUGIN_RECAPTCHA_ENABLED=true
PLUGIN_RECAPTCHA_THRESHOLD_LOGIN=0.5
PLUGIN_RECAPTCHA_THRESHOLD_SIGNUP=0.7

# Logging
RECAPTCHA_LOG_LEVEL=info

# Monitoring
MONITORING_ENABLED=true
ALERTS_ENABLED=true
```

### 2.4 Deploy to Staging

```bash
# 1. Build and push image
docker build -f Dockerfile -t docmost:recaptcha-staging \
  --build-arg ENVIRONMENT=staging .

docker push gcr.io/recaptcha-staging/docmost:recaptcha-staging

# 2. Deploy to staging cluster
kubectl set image deployment/docmost-staging \
  docmost=gcr.io/recaptcha-staging/docmost:recaptcha-staging \
  -n staging

# 3. Verify deployment
kubectl get pods -n staging
kubectl logs -n staging -l app=docmost --tail=100

# 4. Run migrations
kubectl exec -it deployment/docmost-staging -n staging \
  -- npm run db:migrate

# 5. Verify health
curl https://staging.example.com/health
```

### 2.5 Staging Validation Checklist

```
□ reCAPTCHA script loads correctly
□ Token generation works
□ Backend verification passes
□ Scores are recorded in database
□ Login flow accepts legitimate users
□ Signup flow rejects low scores
□ MFA challenge triggers correctly
□ Admin dashboard shows metrics
□ Monitoring alerts trigger
□ Logs show verification attempts
□ Error handling works
□ Performance: <500ms per request
```

---

## 3️⃣ Production Environment Setup

### 3.1 Create Production reCAPTCHA Keys

```bash
# Go to https://www.google.com/recaptcha/admin

# Create a new site:

Label: Docmost Production
reCAPTCHA type: reCAPTCHA v3

Domains:
  example.com
  www.example.com
  app.example.com

# Save the keys securely
```

### 3.2 Secret Management (Production)

**Using Google Secret Manager**:

```bash
# Create secret for site key
echo -n "6Le...production..." | gcloud secrets create \
  recaptcha-site-key \
  --data-file=-

# Create secret for secret key
echo -n "6Le...production...secret..." | gcloud secrets create \
  recaptcha-secret-key \
  --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding recaptcha-secret-key \
  --member=serviceAccount:docmost@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Use in deployment
spec:
  serviceAccountName: docmost-sa
  containers:
  - name: app
    env:
    - name: RECAPTCHA_SECRET_KEY
      valueFrom:
        secretKeyRef:
          name: recaptcha-secret-key
          key: secret
```

### 3.3 Production Environment Variables

**File**: `.env.production`

```bash
# reCAPTCHA Configuration (Production)
RECAPTCHA_SITE_KEY=${RECAPTCHA_SITE_KEY}  # Loaded from Secret Manager
RECAPTCHA_SECRET_KEY=${RECAPTCHA_SECRET_KEY}  # Loaded from Secret Manager

# Plugin Configuration (Production)
PLUGIN_RECAPTCHA_ENABLED=true
PLUGIN_RECAPTCHA_THRESHOLD_LOGIN=0.5
PLUGIN_RECAPTCHA_THRESHOLD_SIGNUP=0.7
PLUGIN_RECAPTCHA_THRESHOLD_CHECKOUT=0.8

# Logging
RECAPTCHA_LOG_LEVEL=warn

# Monitoring & Alerts
MONITORING_ENABLED=true
ALERTS_ENABLED=true
ALERT_EMAIL=ops@example.com

# Feature Flag (Gradual Rollout)
RECAPTCHA_ROLLOUT_PERCENTAGE=0  # Start at 0%
```

### 3.4 Production Deployment

**Step 1: Pre-flight Checks**

```bash
# 1. Verify reCAPTCHA keys are correct
curl -X POST https://www.google.com/recaptcha/api/siteverify \
  -d "secret=${RECAPTCHA_SECRET_KEY}&response=test_token"

# 2. Check database has migrations
kubectl exec -it deployment/docmost-prod -n prod \
  -- npm run db:status

# 3. Verify monitoring is configured
kubectl get alertmanagerrules -n monitoring

# 4. Check backup is recent
kubectl exec -it deployment/postgres-prod -n prod \
  -- pg_dump --version
```

**Step 2: Deploy (0% Rollout)**

```bash
# 1. Build production image
docker build -f Dockerfile \
  -t gcr.io/PROJECT_ID/docmost:recaptcha-v1.0.0 .

docker push gcr.io/PROJECT_ID/docmost:recaptcha-v1.0.0

# 2. Deploy with feature flag disabled
kubectl set image deployment/docmost-prod \
  docmost=gcr.io/PROJECT_ID/docmost:recaptcha-v1.0.0 \
  -n prod

# 3. Verify deployment
kubectl rollout status deployment/docmost-prod -n prod

# 4. Monitor for errors
kubectl logs -n prod -f -l app=docmost --tail=200
```

**Step 3: Gradual Rollout**

```bash
# Phase 1: Enable for 10% of users
RECAPTCHA_ROLLOUT_PERCENTAGE=10
kubectl set env deployment/docmost-prod \
  RECAPTCHA_ROLLOUT_PERCENTAGE=10 -n prod

# Monitor for 24 hours
# Check: error rates, latency, bot detection rate

# Phase 2: Increase to 50%
RECAPTCHA_ROLLOUT_PERCENTAGE=50
kubectl set env deployment/docmost-prod \
  RECAPTCHA_ROLLOUT_PERCENTAGE=50 -n prod

# Monitor for 12 hours

# Phase 3: Full rollout (100%)
RECAPTCHA_ROLLOUT_PERCENTAGE=100
kubectl set env deployment/docmost-prod \
  RECAPTCHA_ROLLOUT_PERCENTAGE=100 -n prod
```

### 3.5 Production Validation

```
□ reCAPTCHA loads with production keys
□ Real scores from Google API
□ Database logging working
□ Monitoring metrics flowing
□ Alerts triggering correctly
□ No performance degradation
□ No token leakage in logs
□ Error rates acceptable (<0.1%)
□ Block rate within expected range
□ Users not reporting issues
```

---

## 4️⃣ Database Migration

### 4.1 Run Migrations

```bash
# For development
npm run db:migrate:dev

# For staging
npm run db:migrate:staging

# For production
npm run db:migrate:prod
```

### 4.2 Verify Schema

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'recaptcha_%';

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename LIKE 'recaptcha_%';

-- Sample data
SELECT COUNT(*), decision FROM recaptcha_verifications
GROUP BY decision;
```

---

## 5️⃣ Monitoring & Alerts

### 5.1 Prometheus Metrics

**File**: `apps/server/src/ee/plugins/recaptcha/metrics.ts`

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client'

export const recaptchaMetrics = {
  verifications: new Counter({
    name: 'recaptcha_verifications_total',
    help: 'Total verifications',
    labelNames: ['action', 'decision']
  }),

  latency: new Histogram({
    name: 'recaptcha_verification_latency_ms',
    help: 'Verification latency in milliseconds',
    labelNames: ['action'],
    buckets: [50, 100, 200, 500, 1000]
  }),

  score: new Gauge({
    name: 'recaptcha_average_score',
    help: 'Average reCAPTCHA score',
    labelNames: ['action']
  }),

  errors: new Counter({
    name: 'recaptcha_errors_total',
    help: 'Total errors',
    labelNames: ['error_type']
  })
}
```

### 5.2 Prometheus Rules

**File**: `monitoring/recaptcha-rules.yml`

```yaml
groups:
  - name: recaptcha
    rules:
      # Alert on high error rate
      - alert: RecaptchaHighErrorRate
        expr: |
          rate(recaptcha_errors_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High reCAPTCHA error rate"
          description: "Error rate: {{ $value }}"

      # Alert on high block rate
      - alert: RecaptchaHighBlockRate
        expr: |
          rate(recaptcha_verifications_total{decision="block"}[5m]) /
          rate(recaptcha_verifications_total[5m]) > 0.15
        for: 5m
        annotations:
          summary: "High reCAPTCHA block rate"
          description: "Block rate: {{ $value }}"

      # Alert on low average score
      - alert: RecaptchaLowScore
        expr: |
          recaptcha_average_score < 0.5
        for: 10m
        annotations:
          summary: "Low average reCAPTCHA score"
          description: "Average score: {{ $value }}"

      # Alert on high latency
      - alert: RecaptchaHighLatency
        expr: |
          histogram_quantile(0.99, recaptcha_verification_latency_ms) > 500
        for: 5m
        annotations:
          summary: "High reCAPTCHA verification latency"
          description: "P99 latency: {{ $value }}ms"
```

### 5.3 Grafana Dashboard

Create dashboard with panels:

```json
{
  "panels": [
    {
      "title": "Verifications per Minute",
      "targets": [
        {
          "expr": "rate(recaptcha_verifications_total[1m])"
        }
      ]
    },
    {
      "title": "Block Rate",
      "targets": [
        {
          "expr": "rate(recaptcha_verifications_total{decision=\"block\"}[5m]) / rate(recaptcha_verifications_total[5m])"
        }
      ]
    },
    {
      "title": "Average Score",
      "targets": [
        {
          "expr": "recaptcha_average_score"
        }
      ]
    },
    {
      "title": "P99 Latency",
      "targets": [
        {
          "expr": "histogram_quantile(0.99, recaptcha_verification_latency_ms)"
        }
      ]
    }
  ]
}
```

---

## 6️⃣ Rollback Procedures

### 6.1 Quick Rollback

```bash
# Option 1: Disable plugin via environment variable
kubectl set env deployment/docmost-prod \
  PLUGIN_RECAPTCHA_ENABLED=false -n prod

# Verify
kubectl rollout status deployment/docmost-prod -n prod
kubectl logs -n prod -f -l app=docmost --tail=50
```

### 6.2 Version Rollback

```bash
# Rollback to previous image
kubectl rollout undo deployment/docmost-prod -n prod

# Verify
kubectl rollout status deployment/docmost-prod -n prod
```

### 6.3 Database Rollback

```bash
# List migrations
npm run db:migrations

# Rollback one migration
npm run db:migrate:rollback -- --step=1

# Or to specific migration
npm run db:migrate:down -- --to=20260628T000002
```

---

## 7️⃣ Health Checks & Monitoring

### 7.1 Health Endpoint

**File**: `apps/server/src/health/health.controller.ts`

```typescript
@Get('health/recaptcha')
async checkRecaptchaHealth() {
  const config = await this.configService.getConfig('default', 'recaptcha')
  
  if (!config?.enabled) {
    return { status: 'disabled', timestamp: new Date() }
  }

  // Test Google API
  try {
    const testToken = 'health_check_token'
    await this.recaptchaService.verifyToken(
      testToken,
      config.config.secretKey
    )
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    }
  }

  return {
    status: 'healthy',
    verifications: (await this.repo.countToday()).toNumber(),
    avgScore: (await this.repo.getAverageScore()).toNumber(),
    timestamp: new Date()
  }
}
```

**Monitor endpoint**:
```bash
# Check health
curl https://api.example.com/health/recaptcha

# Expected response:
{
  "status": "healthy",
  "verifications": 1234,
  "avgScore": 0.82,
  "timestamp": "2026-06-28T10:15:30Z"
}
```

### 7.2 Synthetic Monitoring

```bash
# Periodic health check
0 * * * * curl -X GET https://api.example.com/health/recaptcha \
  -H "Authorization: Bearer $HEALTH_CHECK_TOKEN" \
  -o /dev/null -s -w "%{http_code}" | \
  [ "200" = "$(cat)" ] || alert_ops
```

---

## 8️⃣ Post-Deployment Checklist

```
□ All pods running and healthy
□ Database migrations applied
□ reCAPTCHA keys verified
□ Monitoring alerts configured
□ Logs flowing to aggregator
□ Metrics visible in Grafana
□ Users can login/signup
□ Scores recorded in database
□ No errors in logs
□ Performance metrics acceptable
□ Rollback procedure verified
□ On-call notified
```

---

## 🆘 Troubleshooting

### Issue: "Invalid reCAPTCHA secret key"

```bash
# Verify secret
echo $RECAPTCHA_SECRET_KEY

# Test with Google
curl -X POST https://www.google.com/recaptcha/api/siteverify \
  -d "secret=${RECAPTCHA_SECRET_KEY}&response=test"

# If 403: Key is invalid
# Solution: Update secret in Secret Manager
```

### Issue: High block rate (>20%)

```bash
# Check average score
SELECT action, AVG(score) FROM recaptcha_verifications
GROUP BY action ORDER BY action;

# If scores are low:
# - Adjust thresholds
# - Check for bot attack
# - Verify Google API working

# Temporarily disable:
kubectl set env deployment/docmost-prod \
  PLUGIN_RECAPTCHA_ENABLED=false -n prod
```

### Issue: Slow verification (<500ms)

```bash
# Check latency metric
curl http://localhost:9090/metrics | grep recaptcha_verification_latency

# Check network:
kubectl exec -it POD_NAME -n prod -- \
  curl -w "@curl-format.txt" -o /dev/null -s https://www.google.com/recaptcha/api/siteverify

# If Google API slow: Increase timeout, retry logic
```

---

## 📋 Deployment Checklist

### Before Deployment
- [ ] Code reviewed and merged
- [ ] All tests passing (unit + integration + e2E)
- [ ] Database migrations tested
- [ ] reCAPTCHA keys obtained and verified
- [ ] Secret Manager configured
- [ ] Monitoring rules deployed
- [ ] Runbooks updated
- [ ] Team notified

### Deployment
- [ ] Image built and pushed
- [ ] Deploy to staging (0%)
- [ ] Validate staging (24h)
- [ ] Deploy to production (0%)
- [ ] Enable 10% rollout
- [ ] Monitor metrics (24h)
- [ ] Enable 50% rollout
- [ ] Monitor metrics (12h)
- [ ] Enable 100% rollout
- [ ] Final verification (48h)

### After Deployment
- [ ] All alerts green
- [ ] No error spike
- [ ] Performance nominal
- [ ] User feedback positive
- [ ] Document results
- [ ] Update runbooks

---

**Status**: Deployment guide ready for production ✅

Follow this guide for safe, monitored deployment of the reCAPTCHA v3 plugin.
