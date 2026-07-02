/**
 * Unit tests for /pulse shared logic (P-A Builder Market Pulse).
 * Run with: npx tsx src/lib/pulse.test.ts
 * (Same plain-assert style as concept-style-image.test.ts / demo-guard.test.ts.)
 */
import assert from "node:assert/strict";
import { PULSE_METROS } from "../data/pulse-metros";
import {
  buildPaymentRows,
  buildPulseGeoPassage,
  countPassageWords,
  fmtMonth,
  normalizePulseSubscription,
  publishableAggregates,
  PULSE_AGG_MIN_N,
  PULSE_PRICE_POINTS,
} from "./pulse";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// ── Metro registry ────────────────────────────────────────────────────────────
ok("registry has 10 metros with unique slugs and series ids", () => {
  assert.equal(PULSE_METROS.length, 10);
  assert.equal(new Set(PULSE_METROS.map((m) => m.slug)).size, 10);
  assert.equal(new Set(PULSE_METROS.map((m) => m.fredPermitsSeriesId)).size, 10);
  for (const m of PULSE_METROS) {
    assert.match(m.slug, /^[a-z0-9-]+$/, `slug ${m.slug}`);
    assert.match(m.fredPermitsSeriesId, /^[A-Z0-9]+BP1FH$/, `series ${m.fredPermitsSeriesId}`);
    assert.ok(m.fredSeriesUrl.endsWith(m.fredPermitsSeriesId), `url matches ${m.slug}`);
  }
});

// ── Payment table ─────────────────────────────────────────────────────────────
ok("payment rows: $500k @ 6.5% / 20% down / 30yr = $2,528 P&I", () => {
  const rows = buildPaymentRows(6.5);
  assert.equal(rows.length, PULSE_PRICE_POINTS.length);
  const r500 = rows.find((r) => r.price === 500_000)!;
  assert.equal(r500.downPayment, 100_000);
  assert.equal(r500.loanAmount, 400_000);
  assert.equal(r500.monthly, 2528); // cross-checked against standard amortization
});

ok("payment rows increase monotonically with price", () => {
  const rows = buildPaymentRows(6.87);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].monthly > rows[i - 1].monthly);
  }
});

// ── GEO passage word-count contract (134–167 words, every pulse page) ─────────
ok("GEO passages are 134-167 words on all 11 pages", () => {
  const counts: Record<string, number> = {
    hub: countPassageWords(buildPulseGeoPassage(null)),
  };
  for (const m of PULSE_METROS) {
    counts[m.slug] = countPassageWords(buildPulseGeoPassage(m));
  }
  for (const [page, n] of Object.entries(counts)) {
    assert.ok(n >= 134 && n <= 167, `${page}: ${n} words (want 134-167)`);
  }
  console.log(`    word counts: ${JSON.stringify(counts)}`);
});

ok("GEO passages name their sources", () => {
  const hub = buildPulseGeoPassage(null);
  assert.ok(hub.includes("MORTGAGE30US") && hub.includes("Census Bureau"));
  for (const m of PULSE_METROS) {
    const p = buildPulseGeoPassage(m);
    assert.ok(p.includes("MORTGAGE30US"), `${m.slug} cites PMMS series`);
    assert.ok(p.includes(m.fredPermitsSeriesId), `${m.slug} cites permit series`);
    assert.ok(p.includes(m.name) && p.includes(m.msaName), `${m.slug} names metro`);
  }
});

ok("GEO passages avoid HUMANIZE-banned words", () => {
  const banned = [/AI-powered/i, /seamless/i, /revolutionary/i, /game-changing/i, /effortless/i];
  for (const metro of [null, ...PULSE_METROS]) {
    const p = buildPulseGeoPassage(metro);
    for (const re of banned) assert.ok(!re.test(p), `banned word ${re} in ${metro?.slug ?? "hub"}`);
  }
});

// ── Subscription validation ───────────────────────────────────────────────────
ok("subscription: valid email + metro slug accepted, email lowercased", () => {
  const r = normalizePulseSubscription({ email: " Builder@Example.COM ", metro: "raleigh" });
  assert.deepEqual(r, { ok: true, email: "builder@example.com", metro: "raleigh" });
});

ok("subscription: missing/'' /'all' metro → null (all metros)", () => {
  for (const metro of [undefined, null, "", "all", "ALL"]) {
    const r = normalizePulseSubscription({ email: "a@b.co", metro });
    assert.deepEqual(r, { ok: true, email: "a@b.co", metro: null });
  }
});

ok("subscription: unknown metro rejected (not silently dropped)", () => {
  const r = normalizePulseSubscription({ email: "a@b.co", metro: "denver" });
  assert.deepEqual(r, { ok: false, error: "invalid_metro" });
});

ok("subscription: bad emails rejected", () => {
  for (const email of [undefined, 42, "", "nope", "a@b", "a b@c.com", `${"x".repeat(255)}@a.com`]) {
    const r = normalizePulseSubscription({ email, metro: null });
    assert.equal(r.ok, false);
  }
});

ok("subscription: non-object bodies rejected", () => {
  for (const body of [null, undefined, "x", 5, ["a@b.co"]]) {
    assert.equal(normalizePulseSubscription(body).ok, false);
  }
});

// ── Aggregates publication gate (n >= 10) ─────────────────────────────────────
ok(`aggregates gate: only n >= ${PULSE_AGG_MIN_N} passes`, () => {
  assert.equal(publishableAggregates(null), null);
  assert.equal(publishableAggregates(undefined), null);
  assert.equal(publishableAggregates({ n: 9, generations: 9, topStyle: null }), null);
  const okAgg = { n: 10, generations: 12, topStyle: "Modern Farmhouse" };
  assert.deepEqual(publishableAggregates(okAgg), okAgg);
});

// ── Formatting ────────────────────────────────────────────────────────────────
ok("fmtMonth renders observation months in UTC", () => {
  assert.equal(fmtMonth("2026-05-01"), "May 2026");
  assert.equal(fmtMonth("2025-12-01"), "December 2025");
});

console.log(`\npulse.test.ts: ${passed} tests passed`);
