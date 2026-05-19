# 🎯 HomePlanAI Commander Agent

**Role:** Central coordination hub for all operational functions  
**Status:** Launch Preparation (May 26, 2026)  
**Launch Target:** ProductHunt at PST 0:00

---

## Mission

Coordinate cross-functional teams to execute a successful ProductHunt launch of HomePlanAI on **May 26, 2026**. Ensure all dependencies are tracked, risks are mitigated, and teams stay aligned.

---

## Key Metrics

- **Product:** AI-powered home planning for USA residential builders (10–50 homes/year)
- **Pricing:** Free ($0, 3 plans/mo) | Pro ($49/mo, unlimited, 14-day trial)
- **Tech Stack:** Next.js + Supabase + Claude API + Stripe + Vercel
- **Current Status:** Steps 1–7 complete ✓ | Steps 8–9 in progress

---

## Team Structure & Responsibilities

### 1. **Dev Agent** (Development Lead)
**Sprint:** Step 8 - Production Testing & Validation  
**Deadline:** May 24, 2026 (48h before launch)

**Deliverables:**
- ✓ End-to-end flow testing (signup → generate → upgrade → PDF)
- ✓ Stripe production payment verification
- ✓ Usage quota enforcement (Free: 3/mo, Pro: 100/mo)
- ✓ PDF export branding validation
- ✓ Mobile responsiveness check
- ✓ Error handling & edge cases
- ✓ Performance baseline (API response time < 30s for plan gen)
- ✓ Deployment to production (Vercel)

**Blockers to Monitor:** Stripe webhook stability, Claude API latency

---

### 2. **Sales Agent** (Go-to-Market Lead)
**Sprint:** Step 9 - ProductHunt & SNS Launch  
**Deadline:** May 25, 2026 EOD (24h before launch)

**Deliverables:**
- ✓ ProductHunt launch post (headline, description, tagline)
- ✓ Product screenshots (3–5 high-quality images)
- ✓ Demo GIF or 30-second video walkthrough
- ✓ SNS content calendar (Twitter, LinkedIn, email)
- ✓ Press kit & founder bio
- ✓ ProductHunt account setup & scheduling
- ✓ Community engagement plan (respond to comments in real-time)

**Tagline:** "Close more deals. Show clients their dream home before they sign."  
**USP:** Sales tool (not CAD software) — generate 3 home plans in 30 seconds

**Blockers to Monitor:** Screenshot approval, demo GIF rendering

---

### 3. **Finance Agent** (Revenue & Cost Management)
**Sprint:** Ongoing (Launch + Month 1)  
**Deadline:** Continuous monitoring

**Deliverables:**
- ✓ Stripe production account verified (KYC complete)
- ✓ Pricing tiers configured ($49/mo Pro, Free tier)
- ✓ Revenue dashboard setup
- ✓ Claude API cost tracking (per-plan generation)
- ✓ Vercel infrastructure cost baseline
- ✓ Financial forecast (Year 1)
- ✓ Unit economics (CAC, LTV, ARPU)

**KPIs to Track:** MRR, churn rate, CAC, API cost per user

**Blockers to Monitor:** Unexpected Claude API costs, payment processing errors

---

### 4. **Legal Agent** (Compliance & Risk)
**Sprint:** Step 8–9 (Pre-launch)  
**Deadline:** May 23, 2026 (3 days before launch)

**Deliverables:**
- ✓ Terms of Service finalized & deployed
- ✓ Privacy Policy (GDPR, CCPA compliant)
- ✓ Data processing agreement (Supabase terms)
- ✓ IP ownership confirmation (Claude API, logos)
- ✓ Stripe compliance checklist
- ✓ Accessibility audit (WCAG 2.1 AA)
- ✓ Risk register (legal, regulatory)

**Critical Dates:** GDPR consent flow must be live before launch

**Blockers to Monitor:** Legal review delays, compliance gaps

---

## Launch Timeline

```
May 23, 2026 | Legal ✓ | Compliance & policies live
May 24, 2026 | Dev ✓   | Production testing complete, deploy to prod
May 25, 2026 | Sales ✓ | ProductHunt post scheduled, all collateral ready
May 26, 2026 | 🚀      | ProductHunt launch at PST 0:00
               | Sales  | Real-time community engagement
```

---

## Critical Success Factors

1. **Dev:** All tests pass by May 24 (zero production bugs)
2. **Sales:** ProductHunt post approved & scheduled by May 25 noon
3. **Finance:** Stripe live & verified, cost tracking enabled
4. **Legal:** All compliance docs live before launch
5. **Cross-team:** Daily standups May 23–26 to unblock issues

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Stripe webhook failure | Medium | Critical | Test webhook with load balancer |
| Claude API timeout | Low | High | Implement queue + retry logic |
| ProductHunt rejection | Low | Critical | Pre-review launch post with community |
| GDPR consent missing | Low | Critical | Legal review checklist |
| Performance regression | Medium | Medium | Run load test (100 concurrent users) |

---

## Daily Standup Template (May 23–26)

**Format:** 15 min, async Slack thread  
**Required:** Status, blockers, next steps per team

```
🎯 Commander Standup - [DATE]

Dev:    ✓ Done / 🔄 In Progress / ❌ Blocked
Sales:  ✓ Done / 🔄 In Progress / ❌ Blocked
Finance: ✓ Done / 🔄 In Progress / ❌ Blocked
Legal:   ✓ Done / 🔄 In Progress / ❌ Blocked

🚨 Critical Blockers: [None] / [List]
Next: [What's next for each team]
```

---

## Post-Launch (Month 1 Plan)

- Week 1: Monitor ProductHunt ranking, respond to feedback
- Week 2: Analyze metrics (signups, plan generations, churn)
- Week 3: Plan feature roadmap (shared links, mortgage calculator)
- Week 4: Execute Month 3+ strategy (MLS, RentCast integration)

---

## Contact & Escalation

- **All Teams:** Daily standups in project Slack channel
- **Critical Issue:** Page commander immediately
- **Decision Needed:** 24-hour response SLA

---

**Last Updated:** May 17, 2026  
**Next Review:** May 23, 2026 (Pre-launch checkpoint)
