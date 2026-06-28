# reCAPTCHA v3 Plugin - Technical Specification

**Version**: 1.0  
**Status**: Phase 2 Planning  

---

## 🎯 Overview

reCAPTCHA v3 is a **score-based bot detection system** that runs silently in the background without user interaction. It assigns a score (0-1) to each request indicating the likelihood it's from a bot.

### Key Characteristics
- **No User Interaction**: Unlike v2, users don't see challenges
- **Score-Based**: Continuous scale (0-1) instead of binary pass/fail
- **Adaptive**: Learns from patterns over time
- **Privacy-Focused**: No personally identifiable information collected

---

## 📊 Scoring Model

### Score Interpretation

| Score | Meaning | Recommended Action |
|-------|---------|-------------------|
| 0.9-1.0 | Very likely legitimate | Allow |
| 0.7-0.9 | Likely legitimate | Allow (monitor) |
| 0.5-0.7 | Uncertain | Challenge (v2) or require extra auth |
| 0.3-0.5 | Likely bot | Require challenge or block |
| 0.0-0.3 | Very likely bot | Block |

### Default Thresholds (Configurable)
- **Login**: 0.5 (allow uncertain users)
- **Signup**: 0.7 (stricter for new accounts)
- **Checkout**: 0.8 (very strict for transactions)
- **Password Reset**: 0.6 (moderate risk)

---

## 🔑 API Specifications

### GET Request (Frontend)
```html
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
<script>
  grecaptcha.ready(function() {
    grecaptcha.execute('YOUR_SITE_KEY', {action: 'submit'}).then(function(token) {
      // Send token to backend
      fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password',
          recaptchaToken: token  // Add this
        })
      });
    });
  });
</script>
```

### Verification Request (Backend)
```
POST https://www.google.com/recaptcha/api/siteverify

Parameters:
- secret: YOUR_SECRET_KEY (never send to frontend)
- response: TOKEN_FROM_FRONTEND

Response:
{
  "success": true,
  "score": 0.9,
  "action": "submit",
  "challenge_ts": "2026-06-28T10:15:30Z",
  "hostname": "example.com"
}
```

---

## 🎯 Actions

### Standard Actions
- `login` - User attempting to log in
- `signup` - New account registration
- `checkout` - Payment/purchase action
- `password_reset` - Password recovery request
- `newsletter` - Email subscription

### Custom Actions
Can define custom actions for any user action you want to protect.

### Implementation
```typescript
// On form submission:
const token = await grecaptcha.execute('siteKey', {
  action: 'login'  // Match backend action name
});
```

---

## 🔐 Security Considerations

### 1. Secret Key Management
- **NEVER** expose secret key in frontend code
- Store in environment variables only
- Rotate secrets periodically
- Use different keys per environment (dev, staging, prod)

### 2. Token Validation
- Tokens expire after ~2 minutes
- Verify `challenge_ts` is recent
- Verify `hostname` matches your domain
- Verify `action` matches expected action

### 3. Score Spoofing Prevention
- Don't trust score alone - combine with other signals
- Monitor for suspicious patterns
- Log all verifications for audit
- Alert on unusual score distributions

### 4. Privacy & Compliance
- **GDPR**: reCAPTCHA v3 is a form of tracking - disclose in privacy policy
- **CCPA**: May require consent
- **HIPAA**: Not recommended for healthcare
- Transparent about bot detection in ToS

---

## 📈 Monitoring & Thresholds

### Metrics to Track
```typescript
{
  totalRequests: number,
  blockedRequests: number,
  averageScore: number,
  scoreDistribution: {
    "0.0-0.2": count,
    "0.2-0.4": count,
    "0.4-0.6": count,
    "0.6-0.8": count,
    "0.8-1.0": count
  },
  actionMetrics: {
    login: { avg_score, blocked_count },
    signup: { avg_score, blocked_count }
  }
}
```

### Alert Conditions
- Average score drops below baseline
- Block rate exceeds threshold (e.g., >10%)
- Sudden spike in low-score requests
- Repeated verification failures from same IP

---

## 🚀 Integration Points

### Phase 1: Login Flow
1. User enters credentials
2. Frontend collects reCAPTCHA token
3. Backend verifies token with Google
4. Score compared against threshold
5. Decision: allow, challenge, or block

### Phase 2: Signup Flow
Similar to login but with stricter threshold

### Phase 3: Other Actions
Extend to checkout, password reset, etc.

---

## ⚙️ Configuration

### Per-Action Configuration
```json
{
  "login": {
    "enabled": true,
    "threshold": 0.5,
    "action": "login",
    "blockAction": "challenge"
  },
  "signup": {
    "enabled": true,
    "threshold": 0.7,
    "action": "signup",
    "blockAction": "block"
  }
}
```

### Admin Settings
- Enable/disable per action
- Adjust threshold
- Choose action on low score (block, challenge, allow with warning)
- View real-time analytics

---

## 🧪 Test Keys

Google provides test keys that always return specific scores:

```
Site Key: 6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
Secret Key: 6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe

This will ALWAYS return:
- score: 0.9 (for human-like behavior)
- Can't test different scores - use real keys or mock
```

---

## 📝 Error Handling

### Verification Failures

| Error | Cause | Action |
|-------|-------|--------|
| Missing secret | Configuration error | Log & allow (temporary) |
| Invalid token | Expired or tampered | Reject & ask for new attempt |
| Network error | Google API down | Fallback strategy |
| Invalid score | Corrupted response | Log & reject |

### Fallback Strategy
- If verification fails: either allow (trust) or require v2 challenge
- Configurable per environment
- Monitor fallback rate

---

## 🔄 Score Interpretation Strategy

### Recommended Approach
1. **Use score as signal, not decision**: Combine with other factors
2. **Progressive enforcement**: Don't immediately block low scores
3. **Adaptive thresholds**: Adjust based on patterns
4. **Graceful degradation**: Have fallback for failures

### Machine Learning
- reCAPTCHA improves over time
- Feedback loop: verify actual user behavior
- Don't overtrust initial scores

---

## 📊 Performance

### Latency
- Frontend token generation: 50-200ms
- Backend verification: 100-300ms
- **Total impact**: <500ms added per request

### Rate Limits
- Google: 1 million assessments per month (free tier)
- Premium pricing available for higher volumes
- No per-IP rate limits

### Caching
- Don't cache verification results (each token is unique)
- Cache configuration (thresholds, enabled status)

---

## 🎓 Best Practices

1. **Don't solely rely on reCAPTCHA**: Use as one signal among many
2. **Monitor the data**: Watch score distributions and adjust thresholds
3. **Transparent to users**: Document in privacy policy
4. **Test with real scenarios**: Test with actual bot traffic patterns
5. **Have a fallback**: Plan for Google API failures
6. **Regular reviews**: Audit block logs regularly

---

## 🔗 References

- [Google reCAPTCHA v3 Documentation](https://developers.google.com/recaptcha/docs/v3)
- [Admin Console](https://www.google.com/recaptcha/admin)
- [Privacy Policy](https://policies.google.com/privacy)

---

**Status**: Complete specification ready for implementation
