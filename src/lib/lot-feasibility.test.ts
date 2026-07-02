/**
 * Unit tests for the static lot-feasibility hints (/tools/lot-feasibility).
 * Run with: npx tsx src/lib/lot-feasibility.test.ts
 * (Same plain-assert style as concept-style-image.test.ts / demo-guard.test.ts.)
 */
import assert from "node:assert/strict";
import {
  BUDGET_BANDS,
  COST_PER_SQFT_HIGH,
  COST_PER_SQFT_LOW,
  MAX_LOT_SQFT,
  MIN_LOT_SQFT,
  getFeasibilityHints,
  normalizeState,
} from "./lot-feasibility";

function main() {
  let passed = 0;

  // 1. State normalization: lowercase + padding accepted, junk rejected
  {
    assert.equal(normalizeState(" tx "), "TX");
    assert.equal(normalizeState("DC"), "DC");
    assert.equal(normalizeState("XX"), null);
    assert.equal(normalizeState(""), null);
    assert.equal(normalizeState(undefined), null);
    passed += 5;
  }

  // 2. Ballpark build range is derived from the band via the $/sqft bracket
  {
    for (const band of BUDGET_BANDS) {
      const h = getFeasibilityHints({ lotSqft: 8_500, budgetBandId: band.id });
      assert.ok(h.buildRange.minSqft > 0, `${band.id}: min > 0`);
      assert.ok(h.buildRange.minSqft < h.buildRange.maxSqft, `${band.id}: min < max`);
      // Within rounding distance of budget / cost-per-sqft
      assert.ok(
        Math.abs(h.buildRange.minSqft - band.min / COST_PER_SQFT_HIGH) <= 25,
        `${band.id}: min tracks band.min`,
      );
      assert.ok(
        Math.abs(h.buildRange.maxSqft - band.max / COST_PER_SQFT_LOW) <= 25,
        `${band.id}: max tracks band.max`,
      );
      passed += 4;
    }
  }

  // 3. Lot size bands produce distinct notes and label includes acres
  {
    const tiny = getFeasibilityHints({ lotSqft: 1_500, budgetBandId: "250k-400k" });
    const suburb = getFeasibilityHints({ lotSqft: 8_500, budgetBandId: "250k-400k" });
    const acreage = getFeasibilityHints({ lotSqft: 60_000, budgetBandId: "250k-400k" });
    assert.notEqual(tiny.lotNote, suburb.lotNote);
    assert.notEqual(suburb.lotNote, acreage.lotNote);
    assert.ok(suburb.lotLabel.includes("8,500"), "label formats sqft");
    assert.ok(suburb.lotLabel.includes("0.20"), "label includes acres");
    passed += 4;
  }

  // 4. Fit note reacts to geometry: big house on tiny lot vs. small house on acreage
  {
    const cramped = getFeasibilityHints({ lotSqft: 2_000, budgetBandId: "600k-plus" });
    const roomy = getFeasibilityHints({ lotSqft: 100_000, budgetBandId: "under-250k" });
    assert.ok(/multi-story/i.test(cramped.fitNote), "cramped lot suggests multi-story");
    assert.ok(/comfortable/i.test(roomy.fitNote), "roomy lot reads comfortable");
    passed += 2;
  }

  // 5. Out-of-range lot sizes clamp instead of throwing (NaN included)
  {
    const low = getFeasibilityHints({ lotSqft: 0, budgetBandId: "250k-400k" });
    const high = getFeasibilityHints({ lotSqft: 10_000_000, budgetBandId: "250k-400k" });
    const nan = getFeasibilityHints({ lotSqft: Number.NaN, budgetBandId: "250k-400k" });
    assert.ok(low.lotLabel.startsWith(MIN_LOT_SQFT.toLocaleString("en-US")));
    assert.ok(high.lotLabel.startsWith(MAX_LOT_SQFT.toLocaleString("en-US")));
    assert.ok(nan.lotLabel.startsWith(MIN_LOT_SQFT.toLocaleString("en-US")));
    passed += 3;
  }

  // 6. Guardrails: every output carries verify-locally language, a non-empty
  //    checklist, and never any invented regulation numbers (setback ft / coverage %).
  {
    const samples = [
      getFeasibilityHints({ lotSqft: 1_000, budgetBandId: "under-250k", state: "tx" }),
      getFeasibilityHints({ lotSqft: 8_500, budgetBandId: "400k-600k", state: "??" }),
      getFeasibilityHints({ lotSqft: 500_000, budgetBandId: "600k-plus" }),
    ];
    for (const h of samples) {
      assert.ok(/verify locally/i.test(h.disclaimer), "disclaimer says verify locally");
      assert.ok(h.checklist.length >= 4, "checklist has substance");
      assert.ok(h.checklist.some((c) => /zoning/i.test(c)), "checklist covers zoning");
      const prose = [h.lotNote, h.fitNote, h.stateNote, ...h.checklist].join(" ");
      assert.ok(
        !/\d+\s*(?:ft|foot|feet)\s+setback|setback\s+of\s+\d+|\d+\s*%\s*(?:lot\s+)?coverage/i.test(prose),
        "no fabricated setback/coverage numbers in prose",
      );
      passed += 4;
    }
  }

  // 7. Unknown band id falls back instead of crashing
  {
    const h = getFeasibilityHints({
      lotSqft: 8_500,
      budgetBandId: "nope" as unknown as (typeof BUDGET_BANDS)[number]["id"],
    });
    assert.ok(h.buildRange.maxSqft > 0);
    passed += 1;
  }

  console.log(`lot-feasibility.test.ts: all assertions passed (${passed})`);
}

main();
