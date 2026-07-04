/**
 * Unit tests for the W0/W4 observability record layer (cost + error).
 * Run with: npx tsx src/lib/observability.test.ts
 * (Same plain-assert style as content-quality.test.ts / pulse.test.ts.)
 *
 * Pure logic only — no real Anthropic call, no LINE send. The Supabase read
 * helpers are tested against a tiny in-memory fake (no network). The DB writers
 * (trackedMessage / recordClaudeCost / recordError) are thin and never-throwing.
 */
import assert from "node:assert/strict";
import { estimateCostUsd, priceForModel } from "./anthropic-pricing";
import {
  summarizeCosts,
  summarizeErrors,
  getCostSummary,
  getErrorSummary,
  type CostRow,
  type ErrorRow,
} from "./observability";

let passed = 0;

// Tiny chainable Supabase stand-in: from(t).select().gte()/.eq() → resolved
// { data, error }. Enough for getCostSummary / getErrorSummary. No network.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(byTable: Record<string, { data: unknown; error: unknown }>): any {
  return {
    from(table: string) {
      const res = byTable[table] ?? { data: [], error: null };
      return { select: () => ({ gte: () => Promise.resolve(res), eq: () => Promise.resolve(res) }) };
    },
  };
}

// ── Pricing: estimateCostUsd + priceForModel ───────────────────────────────
{
  // Haiku 4.5: $1/MTok in, $5/MTok out. 1M in + 1M out = $6.00.
  assert.equal(estimateCostUsd("claude-haiku-4-5-20251001", 1_000_000, 1_000_000), 6.0, "haiku 1M+1M = $6");
  passed++;

  // Sonnet 4.6: $3/MTok in. 1M in + 0 out = $3.00.
  assert.equal(estimateCostUsd("claude-sonnet-4-6", 1_000_000, 0), 3.0, "sonnet 1M in = $3");
  passed++;

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

// ── summarizeCosts: MTD, day buckets, top jobs (JST) ───────────────────────
{
  const now = new Date("2026-07-15T06:00:00Z"); // 2026-07-15 15:00 JST → 前日=07-14
  const rows: CostRow[] = [
    { job: "cron/a", est_cost_usd: 1.0, created_at: "2026-07-14T10:00:00Z" }, // 前日 (JST 07-14)
    { job: "cron/a", est_cost_usd: 0.5, created_at: "2026-07-13T10:00:00Z" }, // 前々日 (JST 07-13)
    { job: "cron/b", est_cost_usd: 2.0, created_at: "2026-07-05T10:00:00Z" }, // MTD only
    { job: "cron/c", est_cost_usd: 9.0, created_at: "2026-06-30T10:00:00Z" }, // last month → excluded
  ];
  const s = summarizeCosts(rows, { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 });
  assert.equal(s.mtdUsd, 3.5, "MTD excludes prior-month row (1.0+0.5+2.0)");
  assert.equal(s.yesterdayUsd, 1.0, "前日 bucket");
  assert.equal(s.dayBeforeUsd, 0.5, "前々日 bucket");
  assert.deepEqual(s.topJobs, [{ job: "cron/b", usd: 2.0 }, { job: "cron/a", usd: 1.5 }], "top jobs sorted desc");
  assert.deepEqual(s.warnings, [], "quiet: yesterday 1.0<5 daily, 1.0 not >2×0.5 spike, MTD<50");
  passed++;

  // String est_cost_usd (Supabase numeric may arrive as string) is coerced.
  const s2 = summarizeCosts(
    [{ job: "x", est_cost_usd: "1.25", created_at: "2026-07-14T00:00:00Z" }],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(s2.mtdUsd, 1.25, "numeric-as-string est_cost_usd coerced");
  passed++;
}

// ── summarizeCosts: MTD + ratio-spike warnings ─────────────────────────────
{
  const now = new Date("2026-07-15T06:00:00Z");
  const overMtd = summarizeCosts(
    [{ job: "j", est_cost_usd: 60, created_at: "2026-07-10T00:00:00Z" }],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(overMtd.warnings.length, 1, "MTD>threshold raises one warning (row not on 前日 → no daily)");
  assert.match(overMtd.warnings[0], /MTD/, "warning mentions MTD");
  passed++;

  // Ratio spike: 前日 2.0 > 2×前々日 0.5 (=1.0), 前々日 >= floor; 2.0<5 daily → spike only.
  const spike = summarizeCosts(
    [
      { job: "j", est_cost_usd: 2.0, created_at: "2026-07-14T00:00:00Z" },
      { job: "j", est_cost_usd: 0.5, created_at: "2026-07-13T00:00:00Z" },
    ],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(spike.warnings.length, 1, "day-over-day spike raises one warning");
  assert.match(spike.warnings[0], /前々日/, "spike warning mentions 前々日");
  passed++;

  // Below floor → no spike even if ratio huge (noise suppression); 0.4<5 → no daily.
  const belowFloor = summarizeCosts(
    [
      { job: "j", est_cost_usd: 0.4, created_at: "2026-07-14T00:00:00Z" },
      { job: "j", est_cost_usd: 0.01, created_at: "2026-07-13T00:00:00Z" },
    ],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.deepEqual(belowFloor.warnings, [], "tiny prior-day spend suppresses spike alert");
  passed++;
}

// ── FIX ②: zero-baseline absolute daily warning ($0 前々日 → $X 前日) ─────────
{
  const now = new Date("2026-07-15T06:00:00Z");
  // The exact $11.47-from-zero case: ratio spike is structurally blind (no prior
  // baseline); the absolute daily ceiling MUST catch it.
  const zero = summarizeCosts(
    [{ job: "cron/daily-brief:research", est_cost_usd: 11.47, created_at: "2026-07-14T02:00:00Z" }],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.equal(zero.dayBeforeUsd, 0, "zero baseline (前々日 $0)");
  assert.equal(zero.yesterdayUsd, 11.47, "前日 spend captured");
  assert.equal(zero.warnings.length, 1, "daily ceiling fires; ratio spike silent at $0 baseline");
  assert.match(zero.warnings[0], /日次閾値/, "warning is the absolute daily ceiling");
  passed++;

  // Normal small daily spend below the ceiling stays silent (no noise).
  const quiet = summarizeCosts(
    [{ job: "j", est_cost_usd: 1.0, created_at: "2026-07-14T02:00:00Z" }],
    { now, mtdWarnUsd: 50, dailyWarnUsd: 5, spikeFloorUsd: 0.5, spikeMultiplier: 2 },
  );
  assert.deepEqual(quiet.warnings, [], "normal daily spend under ceiling → silent");
  passed++;
}

// ── FIX ③: buckets computed in JST, not UTC ────────────────────────────────
{
  // now = 2026-07-15 06:00 UTC = 15:00 JST. 前日(JST)=07-14, 前々日(JST)=07-13.
  const now = new Date("2026-07-15T06:00:00Z");
  const rows: CostRow[] = [
    // 07-13 20:00 UTC = 07-14 05:00 JST → 前日. (UTC bucketing would mislabel this 前々日.)
    { job: "a", est_cost_usd: 2.0, created_at: "2026-07-13T20:00:00Z" },
    // 07-12 20:00 UTC = 07-13 05:00 JST → 前々日.
    { job: "b", est_cost_usd: 1.0, created_at: "2026-07-12T20:00:00Z" },
    // 07-14 20:00 UTC = 07-15 05:00 JST → 当日 → neither.
    { job: "c", est_cost_usd: 4.0, created_at: "2026-07-14T20:00:00Z" },
  ];
  const s = summarizeCosts(rows, { now, mtdWarnUsd: 50, dailyWarnUsd: 100, spikeFloorUsd: 0.5, spikeMultiplier: 2 });
  assert.equal(s.yesterdayUsd, 2.0, "07-13T20Z is 前日 in JST (UTC would say 前々日)");
  assert.equal(s.dayBeforeUsd, 1.0, "07-12T20Z is 前々日 in JST");
  assert.equal(s.mtdUsd, 7.0, "all three within the JST month");
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

// ── FIX ①: getCostSummary / getErrorSummary FAIL-LOUD on Supabase read error ─
async function failLoudTests(): Promise<number> {
  let n = 0;
  const now = new Date("2026-07-15T06:00:00Z");

  // cron_costs read error → error surfaced, NOT summarized as a healthy $0.
  const costErr = await getCostSummary(
    fakeSupabase({
      cron_costs: { data: null, error: { message: "permission denied for table cron_costs" } },
      api_usage_external: { data: [], error: null },
    }),
    now,
  );
  assert.ok(costErr.error && /cron_costs/.test(costErr.error), "cost read error surfaced (not false-green $0)");
  assert.equal(costErr.mtdUsd, 0, "figures are zeroed, but .error is the signal the brief checks");
  n++;

  // error_events read error → error surfaced, NOT summarized as a healthy 0件.
  const errErr = await getErrorSummary(
    fakeSupabase({ error_events: { data: null, error: { message: "relation error_events does not exist" } } }),
    now,
  );
  assert.ok(errErr.error && /error_events/.test(errErr.error), "error read failure surfaced (not false-green 0件)");
  n++;

  // Healthy reads → error null (no false alarm).
  const okSupa = fakeSupabase({
    cron_costs: { data: [], error: null },
    api_usage_external: { data: [], error: null },
    error_events: { data: [], error: null },
  });
  assert.equal((await getCostSummary(okSupa, now)).error, null, "healthy cost read → error null");
  assert.equal((await getErrorSummary(okSupa, now)).error, null, "healthy error read → error null");
  n++;

  return n;
}

failLoudTests()
  .then(extra => {
    console.log(`observability.test.ts: all ${passed + extra} assertion groups passed ✅`);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
