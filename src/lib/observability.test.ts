/**
 * Unit tests for the W0/W4 observability record layer (cost + error).
 * Run with: npx tsx src/lib/observability.test.ts
 * (Same plain-assert style as content-quality.test.ts / pulse.test.ts.)
 *
 * Pure logic only — no real Anthropic call, no Supabase, no LINE send. The
 * DB/API writers (trackedMessage / recordClaudeCost / recordError) are thin and
 * never-throwing; the risk-bearing logic is the pricing + summarizers below.
 */
import assert from "node:assert/strict";
import { estimateCostUsd, priceForModel } from "./anthropic-pricing";
import { summarizeCosts, summarizeErrors, type CostRow, type ErrorRow } from "./observability";

let passed = 0;

// ── Pricing: estimateCostUsd + priceForModel ───────────────────────────────
{
  // Haiku 4.5: $1/MTok in, $5/MTok out. 1M in + 1M out = $6.00.
  assert.equal(estimateCostUsd("claude-haiku-4-5-20251001", 1_000_000, 1_000_000), 6.0, "haiku 1M+1M = $6");
  passed++;

  // Sonnet 4.6: $3/MTok in. 1M in + 0 out = $3.00.
  assert.equal(estimateCostUsd("claude-sonnet-4-6", 1_000_000, 0), 3.0, "sonnet 1M in = $3");
  passed++;

  // Dated snapshot resolves via prefix match.
  assert.equal(priceForModel("claude-haiku-4-5-20251001").matched, true, "dated haiku prefix-matches");
  passed++;

  // Unknown model → conservative HIGH fallback ($10/MTok in). 1M in = $10.
  assert.equal(priceForModel("gpt-4o").matched, false, "unknown model is unmatched");
  assert.equal(estimateCostUsd("some-unknown-model", 1_000_000, 0), 10.0, "unknown model uses high fallback");
  passed++;

  // Defensive: negative / NaN / missing tokens count as 0.
  assert.equal(estimateCostUsd("claude-haiku-4-5", 0, -5), 0, "negative tokens → 0");
  assert.equal(estimateCostUsd("claude-haiku-4-5", NaN, undefined), 0, "NaN/undefined tokens → 0");
  passed++;

  // Realistic small call: 2k in + 500 out on Haiku = 2000/1e6*1 + 500/1e6*5 = 0.0045.
  assert.equal(estimateCostUsd("claude-haiku-4-5", 2000, 500), 0.0045, "small haiku call estimate");
  passed++;
}

// ── summarizeCosts: MTD, day buckets, top jobs ─────────────────────────────
{
  const now = new Date("2026-07-15T06:00:00Z"); // yesterday=07-14, dayBefore=07-13
  const rows: CostRow[] = [
    { job: "cron/a", est_cost_usd: 1.0, created_at: "2026-07-14T10:00:00Z" }, // yesterday
    { job: "cron/a", est_cost_usd: 0.5, created_at: "2026-07-13T10:00:00Z" }, // dayBefore
    { job: "cron/b", est_cost_usd: 2.0, created_at: "2026-07-05T10:00:00Z" }, // MTD only
    { job: "cron/c", est_cost_usd: 9.0, created_at: "2026-06-30T10:00:00Z" }, // last month → excluded
  ];
  const s = summarizeCosts(rows, { now, mtdWarnUsd: 50, spikeFloorUsd: 0.5, spikeMultiplier: 2 });
  assert.equal(s.mtdUsd, 3.5, "MTD excludes prior-month row (1.0+0.5+2.0)");
  assert.equal(s.yesterdayUsd, 1.0, "yesterday bucket");
  assert.equal(s.dayBeforeUsd, 0.5, "dayBefore bucket");
  assert.deepEqual(s.topJobs, [{ job: "cron/b", usd: 2.0 }, { job: "cron/a", usd: 1.5 }], "top jobs sorted desc");
  assert.deepEqual(s.warnings, [], "no warnings (yesterday 1.0 == 2×0.5, not strictly greater; MTD < 50)");
  passed++;

  // String est_cost_usd (Supabase numeric may arrive as string) is coerced.
  const s2 = summarizeCosts(
    [{ job: "x", est_cost_usd: "1.25", created_at: "2026-07-14T00:00:00Z" }],
    { now, mtdWarnUsd: 50, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(s2.mtdUsd, 1.25, "numeric-as-string est_cost_usd coerced");
  passed++;
}

// ── summarizeCosts: threshold + spike warnings ─────────────────────────────
{
  const now = new Date("2026-07-15T06:00:00Z");
  // MTD over threshold.
  const overMtd = summarizeCosts(
    [{ job: "j", est_cost_usd: 60, created_at: "2026-07-10T00:00:00Z" }],
    { now, mtdWarnUsd: 50, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(overMtd.warnings.length, 1, "MTD>threshold raises one warning");
  assert.match(overMtd.warnings[0], /MTD/, "warning mentions MTD");
  passed++;

  // Day-over-day spike: yesterday 2.0 > 2×dayBefore 0.5 (=1.0), dayBefore >= floor.
  const spike = summarizeCosts(
    [
      { job: "j", est_cost_usd: 2.0, created_at: "2026-07-14T00:00:00Z" },
      { job: "j", est_cost_usd: 0.5, created_at: "2026-07-13T00:00:00Z" },
    ],
    { now, mtdWarnUsd: 50, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(spike.warnings.length, 1, "day-over-day spike raises one warning");
  assert.match(spike.warnings[0], /前日/, "spike warning mentions 前日");
  passed++;

  // Below floor → no spike even if ratio huge (noise suppression).
  const belowFloor = summarizeCosts(
    [
      { job: "j", est_cost_usd: 0.4, created_at: "2026-07-14T00:00:00Z" },
      { job: "j", est_cost_usd: 0.01, created_at: "2026-07-13T00:00:00Z" },
    ],
    { now, mtdWarnUsd: 50, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.deepEqual(belowFloor.warnings, [], "tiny prior-day spend suppresses spike alert");
  passed++;
}

// ── summarizeErrors: count, top routes, threshold ──────────────────────────
{
  const rows: ErrorRow[] = [
    { route: "cron/a" }, { route: "cron/a" }, { route: "cron/a" },
    { route: "cron/b" }, { route: "cron/c" },
  ];
  const noWarn = summarizeErrors(rows, { warnCount: 5 });
  assert.equal(noWarn.count, 5, "error count");
  assert.deepEqual(noWarn.topRoutes[0], { route: "cron/a", n: 3 }, "top route is most frequent");
  assert.equal(noWarn.topRoutes.length, 3, "top routes capped at 3");
  assert.equal(noWarn.warnings.length, 1, "count == threshold (5) warns");
  passed++;

  const under = summarizeErrors([{ route: "cron/a" }], { warnCount: 5 });
  assert.deepEqual(under.warnings, [], "below threshold → no warning");
  assert.equal(under.count, 1, "single error counted");
  passed++;

  const none = summarizeErrors([], { warnCount: 5 });
  assert.deepEqual(none, { count: 0, topRoutes: [], warnings: [] }, "empty → clean summary");
  passed++;
}

console.log(`observability.test.ts: all ${passed} assertion groups passed ✅`);
