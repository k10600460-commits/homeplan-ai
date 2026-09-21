/**
 * The landing-page hero shows a REAL sample — the live portal /s/nfhkewvz —
 * so every number here must equal what that portal displays. Values were
 * read from production `shared_links` on 2026-09-18:
 *   The Ridgewood Craftsman  Craftsman Bungalow   2650 sq ft  $622,500  3 bd 2.5 ba 2 st
 *   The Solana Modern        Contemporary Modern  2900 sq ft  $812,000  3 bd 3 ba   1 st
 *   The Cloverfield Farmhouse Modern Farmhouse    2800 sq ft  $756,000  3 bd 2.5 ba 2 st
 * and the portal renders cost as "$623–$685K" (cost … cost × 1.1, thousands).
 * Run with: npx tsx src/app/lp-sample.test.ts
 */
import assert from "node:assert/strict";
import { SAMPLE_PORTAL, formatCostRange, formatSqft, sampleSqftRange } from "./lp-sample";

assert.equal(SAMPLE_PORTAL.slug, "nfhkewvz");
assert.equal(SAMPLE_PORTAL.href, "/s/nfhkewvz");
assert.equal(SAMPLE_PORTAL.plans.length, 3, "the product generates exactly three concepts");

assert.deepEqual(
  SAMPLE_PORTAL.plans.map((p) => p.name),
  ["The Ridgewood Craftsman", "The Solana Modern", "The Cloverfield Farmhouse"],
);
assert.deepEqual(
  SAMPLE_PORTAL.plans.map((p) => [p.style, p.sqft, p.cost, p.beds, p.baths, p.stories]),
  [
    ["Craftsman Bungalow", 2650, 622500, 3, 2.5, 2],
    ["Contemporary Modern", 2900, 812000, 3, 3, 1],
    ["Modern Farmhouse", 2800, 756000, 3, 2.5, 2],
  ],
);

// Cost range must match the live portal's rendering exactly.
assert.equal(formatCostRange(622500), "$623–$685K");
assert.equal(formatCostRange(812000), "$812–$893K");
assert.equal(formatCostRange(756000), "$756–$832K");

assert.equal(formatSqft(2650), "2,650");
assert.equal(formatSqft(900), "900");
assert.equal(sampleSqftRange(), "2,650–2,900", "dimension-line label spans the smallest to the largest concept");

console.log("lp-sample.test.ts: all assertions passed ✅");
