# Codex Independent Critique of go-forward-draft

**Date:** 2026-06-18  
**Reviewer:** Codex  
**Input reviewed:** `docs/review/go-forward-draft.md`

## Bottom Line

Claude's draft is directionally useful, but it overstates several repo findings and treats off-repo strategy notes as if they were verified facts. The biggest corrections:

1. **Buyer intent/scoring is more implemented than the draft says.** `src/app/api/intent-signals/route.ts` classifies `HOT` / `WARM` / `COLD`, computes next actions, and `src/app/dashboard/DashboardClient.tsx` exposes this in KPI cards, "Hot leads", and "Buyer Activity".
2. **Nurture send UI exists.** The draft's "未確認" item is stale: the dashboard fetches pending drafts and has Send/Dismiss controls wired to `/api/nurture/[id]/send` and `/api/nurture/[id]/dismiss`.
3. **Analytics are thin, but not exactly "2 events only".** Custom events currently include `generate_success`, `cta_click`, and `signup`. The funnel still lacks `checkout_started`, `trial_started`, `checkout_success`, `share_link_created`, `portal_lead_created`, etc.
4. **The CAN-SPAM issue is real, but the penalty number is stale.** FTC guidance currently states up to **$53,088** per violating email and requires a valid physical postal address in commercial messages. The draft cites `$50,122`.
5. **Sales automation is weaker than implied.** `/api/cron/sales-dm-draft` is a skeleton that only checks `outreach_log` connectivity and returns `status: "skeleton"`.
6. **The "Tanaka MTG" ICP shift is not verifiable in this repo.** `agents/sales.md` and `docs/launch/post-launch-sales-20260526.md` still support the older direct-outreach / Sales Navigator-after-$500-MRR posture. Treat the newer ICP as off-repo context unless the source is added.

## Evidence Corrections

### 1. Nurture flow is not draft-only dead code

The draft asks whether `nurture_drafts` have a send UI. They do.

- `src/app/dashboard/DashboardClient.tsx:371-379` fetches `/api/nurture/drafts`.
- `src/app/dashboard/DashboardClient.tsx:417-434` sends a draft via `POST /api/nurture/${draftId}/send`.
- `src/app/dashboard/DashboardClient.tsx:436-443` dismisses a draft.
- `src/app/dashboard/DashboardClient.tsx:877-927` shows top follow-ups with Send/Dismiss.
- `src/app/dashboard/DashboardClient.tsx:1136-1211` shows the full Follow-ups panel.
- `src/app/api/nurture/[id]/send/route.ts:41-130` verifies ownership, checks suppression, sends through Resend, and marks the draft `sent`.

Remaining gap: the send email body has unsubscribe, but no physical postal address (`src/app/api/nurture/[id]/send/route.ts:17-23`).

### 2. Buyer intent scoring is implemented and exposed

The draft says demand triage/scoring logic is absent or not exposed to builders. That is too strong.

- `src/app/api/intent-signals/route.ts:30-40` classifies heat.
- `src/app/api/intent-signals/route.ts:43-67` computes the next action.
- `src/app/api/intent-signals/route.ts:85-96` reads `link_events` and `portal_buyer_state`.
- `src/app/api/intent-signals/route.ts:189-195` sorts by heat and recency.
- `src/app/dashboard/DashboardClient.tsx:660-681` computes hot-lead and visible-lead dashboard state.
- `src/app/dashboard/DashboardClient.tsx:929-957` exposes Hot leads.
- `src/app/dashboard/DashboardClient.tsx:1066-1134` exposes Buyer Activity with HOT/WARM/COLD, next action, views, prequal, selected, and PDF badges.
- `src/app/api/cron/daily-brief/route.ts:124-169` also computes hot leads from `link_events`.

Fair characterization: SplanAI has a **buyer-intent ranking surface**, not a full "demand triage engine". It does not yet model builder capacity, cross-market demand, pipeline value, deal probability, or revenue-prioritized work queues. But the current product is more than raw portal-open notifications.

### 3. Daily Brief is not just finance and Gmail anymore

The draft's Daily Brief claim is mostly positive, but older docs are stale.

- `src/app/api/cron/daily-brief/route.ts:374-413` reads subscriptions, `finance_snapshots`, `link_events`, signups, portal leads, outreach counts, `plan_generations`, hot leads, and overuse flags.
- `src/app/api/cron/daily-brief/route.ts:586-619` sends the digest with MRR/trialing/churned/hot-lead data.
- `src/app/api/cron/daily-brief/route.ts:689-711` renders hot leads.

Implication: when revising the go-forward doc, avoid relying on `docs/launch/investigate-analytics-20260601.md` for current Daily Brief behavior; source has moved since then.

### 4. Analytics gap is real, but implementation recommendation needs adjustment

Current custom Vercel Analytics calls:

- `src/app/HomePageClient.tsx:671` tracks `generate_success`.
- `src/app/HomePageClient.tsx:745` and `src/app/HomePageClient.tsx:770` track `cta_click`.
- `src/app/generate/GenerateClient.tsx:109` tracks `generate_success`.
- `src/app/dashboard/DashboardClient.tsx:645` tracks `signup`.

Missing:

- checkout initiated / checkout returned success
- trial started from Stripe webhook/subscription state
- plan selected at pricing CTA level
- shared portal created
- portal lead submitted
- nurture draft sent
- upgrade/manage billing click
- login vs signup distinction

Contrarian note: the draft says to add `track()` in `auth/confirm` and checkout routes. Those are server routes (`src/app/auth/confirm/route.ts`, `src/app/api/checkout/route.ts`), while current `track()` usage is client-side. For server-side funnel truth, use either:

- a small `analytics_events` table written from route handlers/webhooks, or
- client-side events on the landing pages after redirects, plus Stripe webhook-derived subscription events.

Do not assume Vercel client `track()` can cleanly solve server-only milestones like Stripe trial creation.

### 5. CAN-SPAM risk is real, but scope should be precise

Repo evidence:

- `src/lib/emails.ts:27`, `50`, `69`, `99`, `137`, `163` footers lack a physical postal address.
- `src/app/api/nurture/[id]/send/route.ts:17-23` includes unsubscribe but lacks physical postal address.
- `src/app/privacy/page.tsx:140` and `src/app/terms/page.tsx:176` retain counsel TODOs around CAN-SPAM / anti-spam compliance.

External source:

- FTC CAN-SPAM guidance says the Act covers commercial messages including B2B email, gives recipients opt-out rights, requires a valid physical postal address, and lists penalties up to `$53,088` per separate violating email: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

Nuance: not every transactional email necessarily carries every CAN-SPAM requirement, but nurture/follow-up emails that promote a builder proposal or SplanAI-enabled buying action are risky enough to block before real sends.

### 6. MLS OAuth and plan generation claims mostly hold, but "稼働" should be qualified

Supported:

- `src/app/api/mls/connect/route.ts:73-99` tests Trestle credentials, encrypts client ID/secret/token, and upserts `mls_connections`.
- `src/app/api/mls/connect/route.ts:112-117` maps Trestle auth failures to a 400 "Invalid credentials" response.
- `src/app/api/generate/route.ts:170-188` inserts `plan_generations`.

Qualification:

- `plan_generations` insert is **non-blocking**. If it fails, the user still receives generated plans (`src/app/api/generate/route.ts:172-188`, then response at `197-207`). This is good UX, but "稼働" should mean "best-effort telemetry", not guaranteed accounting.
- MLS real-credential e2e remains unverified from source alone.

### 7. LP Reviews claim is correct enough

- Nav points to `#reviews` with label "Reviews" (`src/app/HomePageClient.tsx:723-727`).
- `testimonials.items` is an empty const (`src/app/HomePageClient.tsx:118-122`).
- The target section is actually "What you get", not reviews (`src/app/HomePageClient.tsx:1247-1259`).

This is a trust/expectation mismatch. It is not as urgent as compliance or instrumentation, but it is an easy fix.

## Contrarian Review of Strategy Points

### Point 1: "0 replies means offer/ICP/message, not channel"

This is plausible, but overconfident.

What the repo supports:

- Current sales docs are old-ICP-oriented: annual 5-80 homes, owner-operated builders (`agents/sales.md:18-30`).
- DM patterns are drafted for small builders and $49 ROI framing (`agents/sales.md:72-154`).
- The automated sales cron is not actually drafting/sending; it is a skeleton (`src/app/api/cron/sales-dm-draft/route.ts:25-34`).

What the repo does **not** support:

- Whether Homestead Built opened multiple times.
- Which pattern was actually sent to which company.
- Whether senders landed in inbox, promotions, or spam.
- Whether zero replies are due to offer, ICP, deliverability, lack of personalization, weak CTA, wrong persona, no follow-up, or simply low sample size.

Better claim: "The current repo cannot diagnose 0 replies. It can only show that the sales playbook and automation are immature. The next experiment should instrument outreach outcomes before declaring the channel or offer at fault."

### Point 2: "Two mutually inconsistent ICPs coexist"

This is directionally right, but the stronger "Tanaka MTG after-state" is not repo-verifiable.

Verified in repo:

- `agents/sales.md` targets annual 5-80 homes and delays paid LinkedIn Sales Navigator until MRR `$500` (`agents/sales.md:18-30`).
- `docs/launch/post-launch-sales-20260526.md:193-204` repeats direct outreach and Sales Navigator-after-MRR-$500 as confirmed decisions.
- LP copy says "small and mid-sized" in some places, but pricing and DM patterns still center $49/$149 self-serve.

Not verified in repo:

- "100-person builder" as the new ICP.
- "LinkedIn first" as a new committed strategy.
- "Team/Custom price too cheap" as a committed pricing decision.

Contrarian position: do not rewrite everything around a 100-person ICP until that ICP has a source-of-truth doc and a target account list. The repo currently supports **small to mid-sized builders**, not a clean mid-market pivot.

### Point 5: "Tanaka fee is not on the critical path; Apollo is the only required tool"

This is too tool-centric and still unproven.

Problems:

- I found no repo source for the Tanaka fee terms.
- I found no repo source proving Apollo is required or sufficient.
- The existing sales cron is a skeleton, so the bottleneck is not just lead sourcing. It is also operations: target list, personalization, follow-up cadence, reply handling, and measurement.
- Sales Navigator is explicitly deferred in repo docs, but LinkedIn manual outreach can still happen without paid Sales Navigator.

Contrarian position: the cheapest validation path is not "Apollo only"; it is "manual, instrumented outreach to a small source-of-truth list." Buy Apollo only if the immediate bottleneck is verified to be email discovery volume.

### Point 6: "Analytics first, Reviews later"

Mostly agree, with one adjustment: **CAN-SPAM/compliance first if nurture emails can be sent to buyers.**

Priority should be:

1. Add physical postal address / sender attribution to commercial and nurture emails before real buyer follow-up sends.
2. Add minimal server-side funnel logging for checkout/trial/share/nurture events.
3. Rename the misleading "Reviews" nav label.
4. Defer real testimonials until actual customers exist.

Reason: analytics improves learning, but compliance prevents an avoidable legal/product trust failure once the new Follow-ups UI is used.

## Gaps and Overstatements to Fix Before Final

- Replace "demand scoring logicなし" with "intent heat scoring exists; full demand/capacity triage does not."
- Replace "buyer UI未露出" with "Buyer Activity and Hot Leads are exposed in dashboard."
- Remove the open question about nurture send UI; it exists.
- Update CAN-SPAM penalty number to `$53,088` and cite FTC.
- Qualify plan generation inserts as non-blocking telemetry.
- Qualify "顧客0" as off-repo unless verified from production DB.
- Mark Homestead Built behavior as off-repo evidence, not repo-confirmed evidence.
- Do not treat `decisions-log` or Tanaka conclusions as repo-confirmed unless the file/source is added.
- Note that `sales-dm-draft` route is a skeleton despite being scheduled.
- Adjust the analytics recommendation: server-side events need DB/webhook logging or post-redirect client events, not simply `track()` inside route handlers.

## Revised Priority Recommendation

| Priority | Action | Why |
|---|---|---|
| P0 | Add CAN-SPAM-compliant physical address/sender footer to nurture/follow-up commercial email templates | Follow-ups can now be sent from dashboard; this is a real send-path risk |
| P0 | Add a tiny internal funnel/event table for server milestones | Stripe/auth/share/nurture events are not reliably captured by client-only analytics |
| P1 | Update sales source-of-truth: ICP, channel, cadence, follow-up rules, measurement fields | Current `agents/sales.md` is pre-pivot and sales cron is skeletal |
| P1 | Rename LP nav "Reviews" to "Demo" / "Example" / "Output" | Current anchor label overpromises social proof |
| P1 | Run a 10-20 account manual outreach experiment with strict logging | Better than declaring channel/offering failure from incomplete evidence |
| P2 | Build richer triage only after first active lead data | Current HOT/WARM buyer intent is enough for early validation |

## Final Take

Claude's draft is right to worry about compliance, analytics, social proof, and ICP drift. But the final go-forward document should be less binary. The repo has evolved: buyer intent and nurture send are real surfaces now. The riskiest next step is not "build a triage engine"; it is using the existing follow-up machinery without compliant email footers and without a durable funnel log.

