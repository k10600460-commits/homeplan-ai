# Self-service growth and controlled AI maintenance

## Release boundary

This is a **local release candidate**, not a production deployment or evidence
of sales growth. No pricing/target-market changes, outreach restart, real signup,
paid inference, production DB mutation, remote push, or deployment were performed.

## Product changes

- Blog CTA leads straight to `/try?source=blog&article=<public-slug>` instead of a founder email. Existing lot/payment tools remain useful internal links.
- An example fills the demo form without generating. The button respects the existing signed-token age guard; origin checks, visitor claims and daily caps remain.
- The actual sample's numeric lot size and budget are kept in localStorage for at most seven days of use. No address, email, identity, token or generated plan is stored. They prefill `/generate` after signup on the same browser/origin. Cross-device confirmation is not covered. Invalid/expired storage is ignored; private mode still works. A returning cached sample never stores unrelated newly submitted inputs.
- JSON/schema/truncation validation prevents malformed model output reaching rendering/PDF code. Area, bedroom/bathroom and budget checks are **heuristics**, not architectural approval. Demo inconsistencies display a caution; full-generation inconsistencies are recorded as `plan_quality_warning`. They are diagnostic, not an automatic repair, retry, or guarantee of design quality.
- Production model IDs are centralized by role. Current models are unchanged. SDK calls have 45-second timeouts and zero automatic retries; the previous demo `Promise.race` did not cancel the underlying paid call.
- Pricing estimates use the existing shared table, including proposal cache tokens. Official Sonnet 5 pricing is now $2/$10 per million input/output tokens (the planned increase was cancelled); this is an estimate, not an invoice. Unknown future versions cannot silently inherit an older price.

## Two distinct recurring mechanisms (only active after approved release)

1. **Daily content feedback, 22:25 UTC / 07:25 JST.** Restores the existing `content-feedback` cron and public-safe content row consumed by the existing local renderer at 07:40 JST. No migration. X/FB analytics require explicit `CONTENT_FEEDBACK_SOCIAL_ANALYTICS=enabled`; default is first-party only, with gaps marked partial. Search fields that only contain default zeros do not constitute measured zero traffic. The local renderer still depends on the Mac being awake. Re-running the same day upserts the same date, not another row.
2. **Weekly offline checks + public model catalog watch, Monday 01:35 UTC / 10:35 JST.** GitHub Actions runs the regression suite and checks official model/lifecycle documents. Read-only repository permission, no production credentials, paid inference, emails, issue creation, commits or deployment. Evidence is retained as an artifact for 30 days. A new candidate, unknown lifecycle, changed source format or failed fetch produces a visible non-zero result. It does not change production. Schedule activation requires the workflow on the default branch; Actions billing/minute availability and owner notification settings must be checked at release. It is not a guaranteed notification channel.

The second mechanism is **detection + regression checks**, not an autonomous
code-writing or automatic model-promotion agent. Search Console ingestion is
still unverified. Do not describe these mechanisms as live before release.

## AI promotion gate

1. Inspect `npm run ai:watch` output. Public catalog presence does not prove access from the production account. A “Not sooner than” support floor is not a scheduled retirement date.
2. Verify official pricing, API compatibility, thinking behavior, the applicable role, and owner approval for a bounded paid test. No credentials are read from `.env` files by the benchmark.
3. Preview with `npm run ai:evaluate -- --candidate claude-sonnet-5-5`. This is offline and makes zero calls. The paid path additionally requires `--allow-paid --prices-reviewed --max-cost-usd <approved cap>`. A cap must be positive and at most $5. It is conservative reservation logic, **not an account-wide hard billing cap**. Provider spend limits remain necessary.
4. The paired benchmark uses 3 synthetic US briefs × 2 repeats × baseline/candidate = 12 calls per role. It shares the live prompt builders and validates JSON, plan count, required fields, numeric consistency, latency and estimated cost. It stops at the budget reservation or time limit, never retries ambiguous failures, and never consumes customer data. Default gates: no quality errors; p95 no more than 45 s or 120% of baseline; cost no more than 110% of baseline; all cases present once per repeat. A partial run is a hold.
5. Passing only means `eligible_for_human_review`. Inspect actual PDF and portal rendering, buyer usefulness, and more representative briefs. No building-code compliance is certified. Non-US markets and editorial/research tool/output paths require their own tests before changing those role entries.
6. Make a reviewed code change in the registry and prompt version, run all tests, obtain approval, release, observe errors/latency/cost and roll back on regression. No live canary experiment was configured or executed in this change.

## Growth decisions

Do not equate more articles or newer AI with demand. Keep the product's existing
pricing, target and business stop condition. Prefer fixing the earliest measured
break in this sequence:

search visibility → article visit → sample CTA → successful sample → free signup
→ useful saved/shared proposal → paid subscription.

The stages use different ledgers. `scripts/product-funnel.sql` is read-only and
keeps server event counts separate from Vercel CTA clicks and GSC visibility.
It is not a cohort/unique-person conversion report; internal test traffic must
be segmented. Article attribution currently ends at the demo, not revenue.
No live KPI was verified by the local tests.

Work on one observed bottleneck per review, with a before/after measure and a
revert. With too little traffic, keep the hypothesis unconfirmed rather than
claiming an A/B winner. Improve existing helpful pages/examples first; do not
mass-generate pages, fake case studies, local legal claims or customer outcomes.

## Release checklist (human gate)

- Review this isolated branch and its test evidence, then approve push/merge/deploy. No schema change or new subscription required by this patch.
- Confirm the scheduled workflow appears on the default branch and runs once manually. Check that the model artifact is readable and the job finishes within its 10-minute cap.
- After production deployment, verify blog → sample → signup → proposal/PDF on a clearly identified test account/browser. Any real paid generation needs a test budget approval.
- Verify next `content-feedback` heartbeat and date row, then the local feedback note. Missing X/FB/GSC data must remain declared gaps, not a false green or fabricated zero.
- Watch new server events using the private query; do not make the business funnel public in `content_feedback`.

## Rollback

- Revert this release commit or restore the preceding approved deployment. No migration/backfill is needed.
- If only feedback needs stopping, remove its added cron entry; do not re-enable stopped outreach jobs.
- If only weekly checks need stopping, disable this workflow. No production credentials or rotating secret state were added.
- Reverting a model/prompt change later must restore its price entry and prompt version as well. Unknown API errors must not silently trigger a pricier fallback.

## Primary sources (checked 2026-09-29)

- https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/about-claude/pricing
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
