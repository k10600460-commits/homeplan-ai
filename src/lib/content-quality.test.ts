/**
 * Unit tests for suspectStat() and validate() fabrication gating.
 * Run with: npx tsx src/lib/content-quality.test.ts
 * (Same convention as concept-style-image.test.ts — add vitest/jest when a
 * test runner is configured.)
 */
import { suspectStat, validate } from "./content-quality";
import assert from "node:assert/strict";

let passed = 0;

function expectBlocked(text: string, why: string, allowlist?: Array<string | RegExp>) {
  const issues = suspectStat(text, allowlist ? { allowlist } : undefined);
  assert.ok(issues.length > 0, `expected BLOCK (${why}): "${text}" — got no issues`);
  passed++;
}

function expectClean(text: string, why: string, allowlist?: Array<string | RegExp>) {
  const issues = suspectStat(text, allowlist ? { allowlist } : undefined);
  assert.deepEqual(issues, [], `expected CLEAN (${why}): "${text}" — got ${JSON.stringify(issues)}`);
  passed++;
}

// ── Blocked: fabricated customer outcomes actually posted to X (audit 2026-07-02) ──
expectBlocked(
  "One builder went from 3 to 12 concepts per week with SplanAI.",
  "from X to Y customer outcome",
);
expectBlocked(
  "A builder spent 40 hours/month on proposals. SplanAI cut that to 4 hours.",
  "cut-that-to customer outcome",
);
expectBlocked("Proposal time: 40h→4h with SplanAI.", "arrow metric");
expectBlocked("Builders close deals 35% faster with SplanAI.", "% faster");
expectBlocked("Our customers see 3x more leads every month.", "Nx more");
expectBlocked("Just shipped: AI floor plan generation that learns your builder's style.", "just shipped");
expectBlocked("Just launched instant cost estimation overlay.", "just launched");
expectBlocked("Instant cost estimation is now live for every builder.", "now live");
expectBlocked("32% of buyers choose competitors when proposals take too long.", "buyer % stat");
expectBlocked("A recent NAHB study found builders are 34% more likely to close.", "fabricated study");
expectBlocked("Builders using SplanAI generated $1.4 million in additional profit.", "profit claim");

// ── "Just shipped" is NEVER excused, even inside a sourced/allowlisted sentence ──
{
  const text = "Just shipped a new dashboard (NAHB, June 2026).";
  const issues = suspectStat(text, { allowlist: [text] });
  assert.ok(
    issues.some(i => i.startsWith("unverified_claim:")),
    `launch claims must not be excusable — got ${JSON.stringify(issues)}`,
  );
  passed++;
}

// ── Allowed: approved citable stats with an explicit source marker ──
expectClean(
  "NAHB builder confidence (HMI) was 35 in June 2026, below the break-even 50 line (NAHB, June 2026).",
  "sourced macro stat",
);
expectClean(
  "About 62% of builders used sales incentives and ~35% cut prices (NAHB/NAR, June 2026).",
  "sourced macro stat 2",
);
expectClean(
  "US housing starts fell 15.4% month-over-month in May 2026 (U.S. Census Bureau).",
  "sourced census stat",
);

// ── Allowed: caller allowlist (citable_stats-style entries) ──
expectClean(
  "30-year fixed mortgage sits around 6.47% right now.",
  "allowlisted stat",
  ["30-year fixed mortgage"],
);
expectClean(
  "Roughly 79% of builder firms have fewer than 10 employees.",
  "allowlisted regex",
  [/79%\s+of\s+builder\s+firms/i],
);

// ── Allowed: normal copy, hypothetical examples, product description ──
expectClean(
  "From a lot address, SplanAI creates 3 buyer-ready home concepts in about 30 seconds.",
  "product description",
);
expectClean("Say a buyer walks in with a $350k budget. What do you show them?", "hypothetical example");
expectClean("I spent this week rebuilding the proposal flow. Slow, unglamorous work.", "founder build-in-public");
expectClean("Most builders I talk to hate how long proposals take.", "qualitative claim");
// sentence-scoped: a sourced stat in one sentence must not excuse a fabrication in another
{
  const text =
    "Housing starts fell 15.4% in May 2026 (U.S. Census Bureau). One builder went from 3 to 12 concepts per week.";
  const issues = suspectStat(text);
  assert.ok(issues.length > 0, "sentence-scoped exemption failed — fabrication slipped through");
  passed++;
}

// ── validate() integration: fabrications reach blog gate; clean sourced body passes it ──
{
  const dirtyBody = [
    "## Why proposals are slow",
    "One builder went from 3 to 12 concepts per week.",
    "## What changes",
    "Speed matters.",
    "## Wrap up",
    "Try SplanAI.",
  ].join("\n\n").padEnd(700, " word");
  const issues = validate("Title", "d".repeat(120), dirtyBody);
  assert.ok(
    issues.some(i => i.startsWith("suspect_stat:")),
    `validate() must surface suspect_stat — got ${JSON.stringify(issues)}`,
  );
  passed++;
}
{
  const cleanBody = [
    "## Market context",
    "NAHB builder confidence (HMI) was 35 in June 2026 (NAHB, June 2026).",
    "## What builders do",
    "Most builders quote from experience and a spreadsheet.",
    "## Where SplanAI fits",
    "From a lot address, SplanAI creates 3 buyer-ready concepts in about 30 seconds.",
  ].join("\n\n").padEnd(700, " word");
  const issues = validate("Title", "d".repeat(120), cleanBody);
  assert.deepEqual(
    issues.filter(i => i.startsWith("suspect_stat:") || i.startsWith("unverified_claim:")),
    [],
    `clean sourced body must pass — got ${JSON.stringify(issues)}`,
  );
  passed++;
}

// ── Edge cases ──
expectClean("", "empty text");
expectClean("   \n  ", "whitespace only");

console.log(`content-quality.test.ts: all ${passed} assertions passed ✅`);
