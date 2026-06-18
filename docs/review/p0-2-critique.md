# P0-2 Implementation Critique

**Date:** 2026-06-18  
**Reviewer:** Codex  
**Scope:** Uncommitted P0-2 server-side funnel analytics implementation in `homeplan-ai`

## Findings

### [P1] `checkout_started` misses the primary Pro checkout route

`checkout_started` is inserted only in `src/app/api/checkout/route.ts:90-91`. But the dashboard's Pro subscription path still calls `fetch("/api/stripe/checkout")` from `src/app/dashboard/DashboardClient.tsx:627-631`, and that route creates a Stripe session at `src/app/api/stripe/checkout/route.ts:60-82` without any analytics insert. The upgrade page also calls `/api/stripe/checkout` (`src/app/upgrade/page.tsx:30`). Result: a common Pro checkout-start path is invisible in `analytics_events`, so funnel drop-off can look better or worse depending on which checkout route was used. Either consolidate checkout creation through `/api/checkout` or add the same `checkout_started` logging to `/api/stripe/checkout` and any still-live team checkout route.

### [P1] Physical-address footer still ships a placeholder

`src/lib/emails.ts:10` exports `PHYSICAL_ADDRESS = "<<FILL: virtual mailbox US address>>"`, and `footerHtml()` injects it into every transactional/commercial email (`src/lib/emails.ts:12-14`, `35`, `58`, `77`, `107`, `145`, `171`). The nurture send path also injects the same placeholder (`src/app/api/nurture/[id]/send/route.ts:19-23`). This does not satisfy the compliance goal and would expose an obviously unfinished placeholder to users if any email is sent. If the real address is not ready, block nurture sends or omit this implementation from production until the value is real and environment-backed.

### [P2] `checkout_success` is not emitted for normal first-time trial checkouts

The webhook emits either `trial_started` or `checkout_success` from `checkout.session.completed` based on `subscription.status` (`src/app/api/stripe/webhook/route.ts:72-84`). Since first-time Pro/Team subscriptions use `trial_period_days` (`src/app/api/checkout/route.ts:72-74`, `src/app/api/stripe/checkout/route.ts:65-67`, `src/app/api/stripe/team-checkout/route.ts:67-69`), the usual successful checkout will be `trialing` and will only log `trial_started`. If the final spec's seven events require both "checkout completed successfully" and "trial started", this implementation under-reports `checkout_success` for the main acquisition path. If `trial_started` is intended to replace checkout success during trials, document that explicitly and remove `checkout_success` from the claimed seven-event coverage for first-time trial flows.

### [P2] Server-side `signup` logging misses OAuth callback signups

`analytics_events` gets `signup` only in the email OTP confirm route (`src/app/auth/confirm/route.ts:44-47`). OAuth/new-user callbacks go through `src/app/auth/callback/route.ts:45-55`, send the welcome email, and redirect to `/dashboard?new_signup=1` without inserting a server-side analytics event. The existing client `track("signup")` in `src/app/dashboard/DashboardClient.tsx:642-646` still fires, but that is Vercel Analytics, not the new `analytics_events` table. If P0-2 is meant to create durable server-side funnel truth, add `insertEvent("signup", data.user.id, { source: "auth_callback" })` in the callback path too.

### [P2] `portal_lead_created` can be logged even when lead insertion fails

`src/app/api/portal/[slug]/inquiry/route.ts:73-83` awaits `portal_leads.insert(...)` but does not inspect `{ error }`. The new analytics insert runs immediately after (`src/app/api/portal/[slug]/inquiry/route.ts:85-88`). If the lead insert fails, the route can still log `portal_lead_created` and continue toward `ok: true`, creating a false-positive funnel event. Capture and handle the insert result before logging the analytics event.

## Requested Checks

### 1. Stripe webhook idempotency / dedup

Mostly OK. The migration adds `stripe_event_id text UNIQUE` (`supabase/migrations/20260618_analytics_events.sql:14`), and webhook inserts pass `stripeEventId: event.id` for `trial_started` / `checkout_success` (`src/app/api/stripe/webhook/route.ts:75-83`). Retries of the same Stripe event should hit the unique constraint, and `insertEvent()` swallows the rejection (`src/lib/analytics.ts:20-31`), so the webhook response is not blocked. Minor downside: duplicate retries will log noisy `[analytics]` errors rather than doing `upsert` / `onConflict`.

### 2. `analytics_events` schema, RLS, builder scoping

Mostly OK for owner-scoped events. The table has `user_id uuid REFERENCES auth.users(id)`, `metadata jsonb`, and indexes for user, event, and time (`supabase/migrations/20260618_analytics_events.sql:7-19`). RLS is enabled and builders can only select their own events (`supabase/migrations/20260618_analytics_events.sql:21-27`). Writes go through the service role helper (`src/lib/analytics.ts:3-7`, `20-27`).

Builder scoping is correct in the new insert calls I checked: checkout/signup/share/nurture use the authenticated builder user id, and portal inquiries use `shared_links.user_id` as `builderUserId` (`src/app/api/portal/[slug]/inquiry/route.ts:57-72`, `85-88`). Team-level aggregation is not modeled; this is per-auth-user analytics, not team-owner analytics.

### 3. Inserts non-blocking / best-effort

Mostly OK. `insertEvent()` returns `void`, does not await the Supabase insert, and logs/swallow errors via `.then(..., errorHandler)` (`src/lib/analytics.ts:15-31`). Call sites call it after the primary operation succeeds and do not await event persistence. The exception is not analytics blocking, but accuracy: `portal_lead_created` is called after an unchecked primary insert, as noted above.

### 4. No PII / raw IP logged

Pass for the new `analytics_events` calls. Metadata contains plan names, Stripe session/subscription ids, link ids/slugs, draft ids, and boolean contact-presence flags. I did not find raw IP, email, buyer name, buyer phone, or user-agent values written to `analytics_events`. Existing `link_events` still records hashed IP and user agent separately, but that is outside the new analytics table.

Privacy nuance: portal `slug` and Stripe ids are not raw PII, but they are operationally sensitive identifiers. Keeping them behind owner-scoped RLS is important.

### 5. Event coverage vs the seven events

Partial.

Implemented server-side inserts:

| Event | Insert location | Coverage note |
|---|---|---|
| `signup` | `src/app/auth/confirm/route.ts:44-47` | Email confirm only; OAuth callback missing |
| `checkout_started` | `src/app/api/checkout/route.ts:90-91` | Misses `/api/stripe/checkout` and `/api/stripe/team-checkout` |
| `trial_started` | `src/app/api/stripe/webhook/route.ts:74-78` | Covered for trialing checkout sessions |
| `checkout_success` | `src/app/api/stripe/webhook/route.ts:79-83` | Covered only for active non-trial sessions |
| `share_link_created` | `src/app/api/share/create/route.ts:74-75` | Covered after share insert succeeds |
| `portal_lead_created` | `src/app/api/portal/[slug]/inquiry/route.ts:85-88` | Covered, but can false-positive if lead insert fails |
| `nurture_sent` | `src/app/api/nurture/[id]/send/route.ts:129-132` | Covered after Resend send and draft status update |

Naming note: the final doc mentioned `nurture_sent`; Claude's request says "the 7 events" but also earlier wording used "nurture draft sent". The implementation uses `nurture_sent`; make sure the final metric naming is consistent across docs and dashboards.

## Verification

I ran ESLint on the touched implementation files:

```bash
npm run lint -- src/lib/analytics.ts src/app/api/checkout/route.ts src/app/api/nurture/[id]/send/route.ts src/app/api/portal/[slug]/inquiry/route.ts src/app/api/share/create/route.ts src/app/api/stripe/webhook/route.ts src/app/auth/confirm/route.ts src/lib/emails.ts
```

Result: passed.

