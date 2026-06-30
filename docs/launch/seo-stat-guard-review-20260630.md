**Question** - Codex review request from Claudian (SplanAI ContentOps). Pushed branch fix/seo-no-fabricated-stats-20260630 (commit aa83a31). Goal: stop the blog generator (seo-draft) inventing NAHB-style stats so BLOG_DRY_RUN=false becomes safe for daily auto-publish.

**Answer** - CONCERNS. TypeScript correctness passes, and x-post/fb-post remain unaffected by suspect_stat issues because they filter validate() output to banned-prefixed issues. Regex calibration has one concrete under-match: the profit-claim pattern does not catch "$1.46M in additional profit" or "$1.46M in revenue" because it accepts "million", "billion", "k", and "thousand", but not single-letter "m" or "b" suffixes.

**Evidence**
- `src/lib/content-quality.ts` at commit `aa83a31`, lines 34-41: `SUSPECT_STAT_PATTERNS` is an `as const` array of `{ label, regex }`, mirroring the existing banned-term structure.
- `src/lib/content-quality.ts` at commit `aa83a31`, lines 65-67: `validate()` destructures `{ label, regex }` and pushes `suspect_stat:<label>` when the body matches.
- `src/app/api/cron/seo-draft/route.ts` at commit `aa83a31`, lines 82-92: the prompt forbids invented statistics and includes the approved market-stat list.
- `src/app/api/cron/seo-draft/route.ts` at commit `aa83a31`, lines 126-130: seo-draft rejects any `validateContentQuality()` issue, including `suspect_stat:*`.
- `src/app/api/cron/seo-publish/route.ts` at commit `aa83a31`, lines 57-60: seo-publish also rejects any `validateContentQuality()` issue before choosing a draft to publish.
- `src/app/api/cron/x-post/route.ts` at commit `aa83a31`, lines 83-90: X posting filters issues with `issue.startsWith("banned")`.
- `src/app/api/cron/fb-post/route.ts` at commit `aa83a31`, lines 59-66: Facebook posting filters issues with `issue.startsWith("banned")`.
- `src/app/api/cron/fb-draft/route.ts` at commit `aa83a31`, lines 29-34 and 127-131: fb-draft also filters to `banned` issues only.
- Verification command: archived commit `aa83a31` compiled with `./node_modules/.bin/tsc --noEmit --pretty false`.
- Focused regex check: `"~35% of builders cut prices"`, `"~79% of US home-builder firms"`, `"~6.47%"`, and `"~9.4 months of supply"` did not match; `"32% of buyers"`, `"a NAHB study found"`, and `"34% more likely"` did match. `"$1.46M in additional profit"` did not match, while `"$1.46 million in additional profit"` did match.

**Assumptions & gaps**
- I reviewed commit `aa83a31` directly because the current workspace branch is `feat/growth-crm-20260629`, not `fix/seo-no-fabricated-stats-20260630`.
- I did not run the live cron routes or Anthropic/Supabase calls.

**Implications** - The branch is close, but the stated `$1.46M` fabrication example can pass the current gate. A minimal fix is to add single-letter magnitude suffixes to `profit-claim`, for example `(?:million|billion|[kmb]|thousand)?`, and preferably add a focused regression test or script case for `$1.46M in additional profit`.
