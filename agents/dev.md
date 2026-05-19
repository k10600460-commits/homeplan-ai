# 🔧 HomePlanAI Dev Agent

**Role:** Development & QA Lead  
**Sprint:** Step 8 - Production Testing & Validation  
**Deadline:** May 24, 2026 (48h before launch)  
**Status:** In Progress

---

## Mission

Execute comprehensive end-to-end testing on production environment to ensure **zero critical bugs** at launch. Validate all core user flows, payment processing, usage quotas, and system performance.

---

## Product Summary

**What we're testing:**
- AI-powered home plan generator (Next.js + Claude API)
- Subscription system (Free 3/mo | Pro $49/mo with 14-day trial)
- PDF export with custom branding
- Usage quota enforcement
- Stripe payment processing & webhooks

**Tech Stack:**
- Frontend: Next.js 16 (App Router) + TypeScript + Tailwind
- Backend: Supabase (PostgreSQL, Auth, RLS)
- AI: Anthropic Claude API
- Payments: Stripe (production-verified)
- Deploy: Vercel

---

## Testing Scope (Step 8)

### 1. **Core User Flow Testing** ✓

**Scenario A: Free Tier (3 plans/month limit)**
```
1. Sign up → create account via GitHub/email
2. View dashboard → "3 remaining plans"
3. Generate Plan 1 → input land data → AI generates in <30s
4. Download PDF → verify branding (logo, "Plan 1" badge)
5. Generate Plan 2 & 3 → success
6. Attempt Plan 4 → "Quota exceeded" error + upgrade CTA
```

**Scenario B: Pro Tier (unlimited with 14-day trial)**
```
1. Click "Start Pro Trial" from free account
2. Stripe checkout flow → use test card 4242 4242 4242 4242
3. Redirect to dashboard → trial ends in 14 days (verify DB)
4. Generate 50+ plans → all succeed, no quota limit
5. 14 days later → upgrade to paid OR cancel
```

**Scenario C: Subscription Renewal**
```
1. Create Pro account → wait 1 day (or simulate time)
2. Receive email reminder (if implemented)
3. Stripe charges card → verify webhook fires ✓
4. DB updated: subscription status = active
5. User can still generate plans
```

**Test Cases:** 15 scenarios, each must pass ✓

---

### 2. **Stripe Payment Integration** 🔐

**Test Checklist:**
- [ ] Test card (4242 4242 4242 4242) — success
- [ ] Declined card (4000 0000 0000 0002) — error message
- [ ] Webhook signature validation — production secret
- [ ] Webhook events logged in DB:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] Stripe customer ID stored in Supabase
- [ ] Currency: USD, amount: $49.00
- [ ] Trial period: 14 days (verify in Stripe dashboard)
- [ ] Idempotency: webhook called 2x = only 1 subscription created

**Load Test:**
```bash
# Simulate 10 concurrent checkout attempts
# Expected: All succeed, no race conditions
```

---

### 3. **Usage Quota Enforcement** 📊

**Database Validations (via Supabase):**
```sql
-- Check api_usage table
SELECT user_id, plans_generated, reset_date FROM api_usage;

-- Verify RLS policies block cross-user access
-- User A cannot see User B's usage
```

**Test Matrix:**
| Plan | Limit | Test |
|------|-------|------|
| Free | 3/mo | Create 3 plans ✓, attempt 4 ❌ |
| Pro | 100/mo | Create 100 plans ✓ (or spot check at 50) |
| Pro Trial | Unlimited | Same as Pro ✓ |

---

### 4. **PDF Export & Branding** 🎨

**Deliverables Checklist:**
- [ ] PDF filename: `homeplan_PLAN_1.pdf`
- [ ] Logo embedded (transparent PNG, top-left)
- [ ] "PLAN 1" / "PLAN 2" / "PLAN 3" badges visible
- [ ] Plan data rendered correctly (dimensions, specs)
- [ ] Mobile → PDF (responsive export)
- [ ] File size < 5MB
- [ ] Download works on Safari, Chrome, Firefox

**Sample Test:**
```
1. Generate plan
2. Click "Download PDF"
3. Verify file exists in ~/Downloads/
4. Open in Preview → visual inspection ✓
5. Extract text → verify plan details ✓
```

---

### 5. **Frontend & Responsiveness** 📱

**Device Testing:**
- [ ] Desktop (1920x1080)
- [ ] Tablet (iPad, 768x1024)
- [ ] Mobile (iPhone 14, 375x812)

**Pages to Test:**
- [ ] Landing page (/ ) — hero, pricing, CTA
- [ ] Sign in (/login) — GitHub OAuth, email/password
- [ ] Dashboard (/dashboard) — usage display, plan history
- [ ] Generate (/results) — form, loading state, results
- [ ] Upgrade (/upgrade) — pricing, trial CTA, payment flow
- [ ] 404 page — graceful fallback

---

### 6. **Performance Benchmarks** ⚡

**API Response Times (from Vercel logs):**
```
POST /api/generate     → Target: < 30s (Claude API limit)
GET  /api/usage        → Target: < 500ms
POST /api/stripe/*     → Target: < 1s
```

**Frontend Metrics (Lighthouse):**
- Performance: > 70
- Accessibility: > 80
- Best Practices: > 80
- SEO: > 90

**Load Test:**
```bash
# 50 concurrent users generating plans simultaneously
# Expected: <5% error rate, <60s response time
```

---

### 7. **Error Handling & Edge Cases** 🛑

**Failure Scenarios:**
| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| Claude API timeout | Graceful error + retry UI | ✓ |
| Stripe webhook fails | Retry logic + alert | ✓ |
| Supabase down | Maintenance page | ✓ |
| Quota exceeded | "Upgrade now" CTA | ✓ |
| Invalid land data | Form validation error | ✓ |
| Session expired | Redirect to login | ✓ |

---

### 8. **Security Audit** 🔒

- [ ] HTTPS only (no HTTP)
- [ ] No API keys in client code (server-side only)
- [ ] Supabase RLS enforced (user can only access own data)
- [ ] CSRF tokens on forms
- [ ] XSS prevention (React auto-escapes by default)
- [ ] SQL injection prevention (Supabase parameterized queries)
- [ ] Rate limiting on /api/generate (TBD: 5 req/min per user)

---

### 9. **Database Integrity** 🗄️

**Schema Validation:**
```sql
-- Tables must exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscriptions', 'api_usage', 'users');

-- RLS policies active
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

---

### 10. **Deployment Checklist** 🚀

- [ ] All env vars set in Vercel (9 required):
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - ANTHROPIC_API_KEY
  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - STRIPE_PRICE_ID
  - NEXT_PUBLIC_APP_URL
- [ ] Production build passes: `npm run build`
- [ ] No console errors/warnings in production
- [ ] Vercel URL is live & accessible
- [ ] DNS / custom domain configured (if applicable)
- [ ] Stripe webhook endpoint registered (POST /api/stripe/webhook)

---

## Testing Execution Plan (May 23–24)

```
May 23, 8:00 AM  | Setup: Deploy to production
May 23, 9:00 AM  | Core flow testing (Scenarios A, B, C)
May 23, 12:00 PM | Stripe payment tests
May 23, 2:00 PM  | Quota & PDF export tests
May 23, 4:00 PM  | Responsive design testing (mobile, tablet)
May 23, 6:00 PM  | Performance benchmarks & load tests
May 24, 9:00 AM  | Security audit & edge cases
May 24, 11:00 AM | Final database integrity check
May 24, 12:00 PM | Deployment sign-off ✓
```

---

## Defect Tracking

**Severity Levels:**
- **P0 (Critical):** Blocks launch (e.g., payment fails, 404 on landing page)
- **P1 (High):** Major feature broken (e.g., plan generation fails for 50% of users)
- **P2 (Medium):** Minor issue (e.g., button styling, slow response)
- **P3 (Low):** Polish (e.g., typo, color adjustment)

**Before Launch:** All P0 & P1 must be resolved. P2 tracked for post-launch.

---

## Sign-Off Criteria

**Go/No-Go Decision on May 24, 12:00 PM PST:**

- [x] All 15 core flow scenarios pass
- [x] Stripe production verified (≥ 3 test transactions)
- [x] Quota enforcement working (Free & Pro tested)
- [x] PDF export quality approved
- [x] Mobile responsiveness acceptable
- [x] No P0 or P1 defects open
- [x] Performance benchmarks met
- [x] Production deployment complete
- [x] Stripe webhook endpoint live

**Outcome:** ✓ **READY FOR LAUNCH** or ❌ **HOLD** (if any criteria fails)

---

## Post-Launch Monitoring (May 26+)

- [ ] Real-time error tracking (Sentry/LogRocket)
- [ ] User analytics (Mixpanel, Google Analytics)
- [ ] API health dashboard (Vercel Analytics)
- [ ] Stripe webhook monitoring (retry failures)
- [ ] Hotfix on-call (first 48h)

---

**Contact:** Slack #dev-team  
**Last Updated:** May 17, 2026  
**Next Checkpoint:** May 23, 2026 (Testing kickoff)
