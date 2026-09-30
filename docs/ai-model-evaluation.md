# Concept model evaluation and release

## Runtime contract

- `ai-models.ts` pins role-specific model IDs. No `latest` lookup or automatic provider fallback.
- `concept-contract.ts` is shared by production and evaluation. Models supply a typed room ledger; the application calculates area, bedrooms and bathrooms. Garage area is excluded. Historical results are not rewritten.
- Required `plan1/plan2/plan3` slots enforce result count across providers; unsupported array cardinality constraints are not assumed to work.
- Budget, household, room classification and a **heuristic** footprint cap are checked before delivery. These do not certify zoning, construction prices or architectural quality.
- Quantitative prose claims are omitted, never numerically "corrected". The display/PDF discloses omissions. Raw model scores and post-filter delivery scores are separate.
- Rejected generations record operator token/cost estimates with `p_requests: 0`; successful delivery uses `1`. No automatic paid retry.

## Reproducible evaluation

`npm run ai:evaluate -- --suite us` is a **dry run**. Paid runs require all three flags:
`--allow-paid --prices-reviewed --max-cost-usd <approved-budget>`.
Use `--models`, `--suite us|holdout|demo`, `--repeats 1|2|3`, and `--openai-transport direct|gateway` explicitly.

Only synthetic briefs may be used. Never print keys, provider raw error bodies, customer inputs or auth tokens. The tool stops before exceeding its conservative token-cost reservation and does not retry unavailable models. Timed-out/ambiguous calls retain their full reservation. Costs are estimates, not invoices.

Keep the exact commit, spec hash, raw log, schema failures, raw scores, delivery scores, usage, latency and incomplete cases. An offline replay is **not** a fresh model trial. Do not remove failures from the denominator or claim model intelligence from deterministic arithmetic.

Gateway credits/status success does **not** establish inference access. On 2026-09-30, GPT-6 Luna and GPT-6.1 Sol were rejected with HTTP 403; they were not ranked. Configure an existing authorized OpenAI connection securely or obtain explicit billing approval, then rerun the same suite. ChatGPT subscriptions do not automatically provide this application's API connection.

## Reviewed release, 2026-09-30

- Proposal: Sonnet 5.5 + compact v4 ledger prompt. Final US 3/3 requests and untouched holdout 5/5 passed raw mechanical checks (24 concepts). This is a small synthetic sample, not expert building review or proven conversion uplift.
- Demo: Haiku 4.5, one concept. v4 raw 4/6 passed; 2 responses included unsupported numeric prose. Deterministic omission/replay delivered 6/6 without changing room data; omission remains disclosed and measured.
- Haiku three-concept proposals were cheaper but failed screening. They are **not** promoted based on price alone.
- Sonnet 5.5 was not the cheapest same-prompt option. Select based on quality, usable-output cost and latency, not release date or vendor loyalty.

## Continuous checks

Weekly GitHub Actions runs offline regression tests, Claude lifecycle checks and public Claude/GPT catalog/price checks. Missing sources, changed prices and new GPT candidates require review. It performs **zero inference**, no credential retrieval, no DB write and no automatic deployment.

Model/pricing/prompt changes require an explicitly budgeted comparison, unseen holdouts, content review, browser/PDF checks and a reviewed release. Observe quality rejections, prose omissions, latency, API cost, demo-to-signup and proposal completion after release. Catalog availability alone is never sufficient to switch production.

`ai:evaluate:legacy` retains the old Claude-only evaluator for historical investigation, not current provider selection.
