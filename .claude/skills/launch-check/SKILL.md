---
name: launch-check
description: Pre-launch go/no-go checklist — Vercel deployment, E2E flow, Supabase tables, Stripe webhook health
---

Run a complete pre-launch health check for HomePlanAI. Work through each check in order, then output a final verdict.

## Checks to run

### 1. Vercel deployment status
Use `mcp__vercel__getdeployments` to get the latest deployment for the homeplan-ai project.
Report: deployment state (READY / ERROR / BUILDING), URL, and when it was created.

### 2. E2E flow test
Run: `node /Users/Shoji.S/homeplan-ai/tests/e2e-flow.mjs`
Report: PASS or FAIL with any error output.

### 3. Supabase schema health
Use `mcp__supabase__list_tables` to verify these tables exist: `subscriptions`, `api_usage`, `shared_plans`, `plan_views`.
Report: which tables are present / missing.

### 4. Production API smoke test
Run:
```bash
curl -s -o /dev/null -w '%{http_code}' https://homeplan-ai.vercel.app/
curl -s -o /dev/null -w '%{http_code}' https://homeplan-ai.vercel.app/api/usage
```
Report: HTTP status for each.

### 5. Stripe webhook route exists
Check that `/Users/Shoji.S/homeplan-ai/src/app/api/stripe/webhook/route.ts` exists and calls `stripe.webhooks.constructEvent`.
Report: PASS (signature verification found) or FAIL.

## Output format

Print a table like:

| Check | Status | Notes |
|-------|--------|-------|
| Vercel deployment | ✅ READY | Deployed 2h ago |
| E2E flow | ✅ PASS | |
| Supabase tables | ⚠️ WARN | plan_views missing |
| Production API | ✅ 200 / 200 | |
| Stripe webhook | ✅ PASS | |

Then one line: **LAUNCH READY** or **NOT READY — fix: [blocker list]**
