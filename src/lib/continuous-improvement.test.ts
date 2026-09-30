import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parsePlanOutput, planQualityIssues, PlanOutputError } from "./plan-output";
import { BRIEF_TTL_MS, parseTryBrief, tryAttribution } from "./try-journey";
import { inspectModelDocs as inspectDocs } from "./ai-model-watch";
import { AI_MODELS } from "./ai-models";
import { estimateGenerationCostUsd, priceForModel } from "./anthropic-pricing";
import { EVAL_CASES, assessEvaluation, evaluationPrompt, type EvaluationRow } from "./ai-evaluation";

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`PASS ${name}`); }
const plan = {
  id: 1, name: "Synthetic fixture", style: "Ranch", squareFootage: 1000, bedrooms: 2, bathrooms: 2.5,
  stories: 1, garages: 2, estimatedCost: 180_000, description: "Test fixture, not an architectural design.",
  features: ["Test"], highlights: ["Test"],
  rooms: [{ name: "Primary Bedroom", sqft: 200 }, { name: "Bedroom 2", sqft: 140 }, { name: "Primary Bath", sqft: 80 },
    { name: "Full Bath", sqft: 60 }, { name: "Powder Room", sqft: 20 }, { name: "Kitchen", sqft: 120 },
    { name: "Great Room", sqft: 240 }, { name: "Hallways & Circulation", sqft: 140 }, { name: "Garage", sqft: 400 }],
};
test("valid demo + area/beds/baths reconcile", () => {
  const plans = parsePlanOutput(JSON.stringify({ plans: [plan] }), 1, "end_turn");
  assert.deepEqual(planQualityIssues(plans, 250_000), []);
});
test("three plans and fenced JSON accepted", () => {
  const data = { plans: [1, 2, 3].map(id => ({ ...plan, id })) };
  assert.equal(parsePlanOutput("```json\n" + JSON.stringify(data) + "\n```", 3, "end_turn").length, 3);
});
test("surrounding whitespace before a JSON fence is harmless", () => {
  assert.equal(parsePlanOutput(" \n```json\n" + JSON.stringify({ plans: [plan] }) + "\n```\n ", 1, "end_turn").length, 1);
  assert.throws(() => parsePlanOutput("Here is prose\n" + JSON.stringify({ plans: [plan] }), 1, "end_turn"), /INVALID_JSON/);
});
test("partial response rejected even if JSON parses", () => assert.throws(() => parsePlanOutput(JSON.stringify({ plans: [plan] }), 1, "max_tokens"), /TRUNCATED/));
test("malformed JSON rejected", () => assert.throws(() => parsePlanOutput("not JSON", 1, "end_turn"), /INVALID_JSON/));
test("empty or wrong count rejected", () => { for (const plans of [[], [plan, plan]]) assert.throws(() => parsePlanOutput(JSON.stringify({ plans }), 1, "end_turn")); });
test("duplicate IDs rejected", () => assert.throws(() => parsePlanOutput(JSON.stringify({ plans: [plan, plan, plan] }), 3, "end_turn")));
test("bad field types cannot reach UI/PDF", () => {
  for (const mutation of [{ features: "wrong" }, { rooms: null }, { squareFootage: -1 }, { garages: 99 }, { estimatedCost: "180000" }, { name: "" }]) {
    assert.throws(() => parsePlanOutput(JSON.stringify({ plans: [{ ...plan, ...mutation }] }), 1, "end_turn"));
  }
});
test("geometry/count/budget mismatches detected not silently repaired", () => {
  const issues = planQualityIssues([{ ...plan, squareFootage: 2000, bedrooms: 3, bathrooms: 3, estimatedCost: 300_000 }], 250_000);
  assert.equal(issues.length, 4); assert.equal(plan.squareFootage, 1000);
});
test("schema diagnostics expose paths/codes, never model values", () => {
  try {
    parsePlanOutput(JSON.stringify({ plans: [{ ...plan, estimatedCost: "private model value" }] }), 1, "end_turn");
    assert.fail("must reject");
  } catch (error) {
    assert.ok(error instanceof PlanOutputError);
    assert.deepEqual(error.fields, ["plans.0.estimatedCost:invalid_type"]);
    assert.doesNotMatch(JSON.stringify(error), /private model value/);
  }
});
const now = 1_800_000_000_000;
const brief = { lotSize: 8500, budget: 350_000, savedAt: now };
test("numeric handoff survives a new tab, excludes extra identity fields", () => assert.deepEqual(parseTryBrief(JSON.stringify({ ...brief, email: "not-stored" }), now), brief));
test("expired/future/invalid handoff rejected", () => {
  for (const v of [null, "bad", "[]", "null", JSON.stringify({ ...brief, savedAt: now - BRIEF_TTL_MS - 1 }), JSON.stringify({ ...brief, savedAt: now + 1 }), JSON.stringify({ ...brief, budget: 1 }), JSON.stringify({ ...brief, lotSize: "8500" })]) assert.equal(parseTryBrief(v, now), null);
});
test("attribution only allows public article slugs", () => {
  assert.deepEqual(tryAttribution({ source: "blog", article: "lot-size-guide" }), { entry_source: "blog", article_slug: "lot-size-guide" });
  for (const article of ["https://example.com", "a@b.com", "../../secret", ["slug"], "x".repeat(121)]) assert.equal(tryAttribution({ source: "blog", article }).entry_source, "direct");
});
const statuses = "## Model status\n| Model | Status | Deprecated | Retirement |\n| claude-sonnet-5 | Active | N/A | Not sooner than June 30, 2027 |\n| claude-haiku-4-5-20251001 | Active | N/A | Not sooner than October 15, 2026 |\n## Deprecation history\n";
// Fixed fixtures test upgrade detection independently of today's release pin.
const inspectModelDocs = (overview: string, lifecycle: string) => inspectDocs(overview, lifecycle, {
  proposal: { model: "claude-sonnet-5" }, demo: { model: "claude-haiku-4-5" },
});
test("model catalog detects a newer candidate without promotion", () => {
  const report = inspectModelDocs("| Claude API ID | `claude-sonnet-5-5` | `claude-haiku-4-5-20251001` |", statuses);
  assert.equal(report.needsReview, true); assert.equal(report.automaticModelChange, false);
  assert.deepEqual(report.roles.find(r => r.role === "proposal")?.candidates, ["claude-sonnet-5-5"]);
});
test("same model/snapshot is not an update", () => assert.equal(inspectModelDocs("| Claude API ID | `claude-sonnet-5` | `claude-haiku-4-5-20251001` |", statuses).needsReview, false));
test("lifecycle deprecated and missing statuses fail visibly", () => {
  const overview = "| Claude API ID | `claude-sonnet-5` |";
  assert.equal(inspectModelDocs(overview, statuses.replace("| Active |", "| Deprecated |")).needsReview, true);
  assert.throws(() => inspectModelDocs("<html>challenge</html>", statuses));
  assert.throws(() => inspectModelDocs(overview, "unavailable"));
});
function rows(): EvaluationRow[] {
  return EVAL_CASES.flatMap(c => [0, 1].flatMap(repeat => (["baseline", "candidate"] as const).map(variant => ({ variant, caseId: c.id, repeat, model: variant, durationMs: 20_000, costUsd: 0.04, issues: [] }))));
}
test("paired evaluation only permits human review, never promotion", () => {
  const result = assessEvaluation(rows()); assert.equal(result.status, "eligible_for_human_review"); assert.equal(result.automaticallyPromoted, false);
});
test("incomplete/duplicated cases block evaluation", () => {
  assert.equal(assessEvaluation([]).status, "hold");
  const r = rows(); r[0] = { ...r[2] }; assert.equal(assessEvaluation(r).status, "hold");
});
test("quality/cost/latency regressions block", () => {
  for (const patch of [{ issues: ["room_area_mismatch"] }, { durationMs: 46_000 }, { costUsd: 0.07 }]) {
    const r = rows().map(row => row.variant === "candidate" ? { ...row, ...patch } : row);
    assert.equal(assessEvaluation(r).status, "hold");
  }
});
test("eval uses current prompts and caps", () => {
  assert.match(evaluationPrompt("proposal", EVAL_CASES[0]).system, /room schedule must reconcile/);
  assert.match(evaluationPrompt("demo", EVAL_CASES[0]).system, /exactly 1 plan/);
  assert.equal(evaluationPrompt("proposal", EVAL_CASES[0]).max_tokens, AI_MODELS.proposal.maxTokens);
});
test("Sonnet 5.5 evaluation uses its documented non-thinking wire mode", () => {
  assert.equal(evaluationPrompt("proposal", EVAL_CASES[0], "claude-sonnet-5").thinking?.type, "disabled");
  assert.equal(evaluationPrompt("proposal", EVAL_CASES[0], "claude-sonnet-5-5").thinking?.type, "between_tools");
  assert.equal(evaluationPrompt("demo", EVAL_CASES[0]).thinking, undefined);
});
test("current model price and cache costs share one estimate", () => {
  assert.equal(estimateGenerationCostUsd("claude-sonnet-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12);
  assert.equal(estimateGenerationCostUsd("claude-sonnet-5", { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 1000 }), 0.0147);
});
test("future version never silently inherits an old price", () => {
  assert.equal(priceForModel("claude-sonnet-5-9").matched, false);
  assert.equal(priceForModel("claude-haiku-4-5-20251001").matched, true);
});
const root = fileURLToPath(new URL("../", import.meta.url));
const source = (p: string) => readFileSync(join(root, p), "utf8");
test("production routes share the benchmark contract and bounded provider transport", () => {
  for (const path of ["app/api/generate/route.ts", "app/api/try-demo/route.ts"]) {
    assert.match(source(path), /conceptPrompt\(/); assert.match(source(path), /acceptConcepts\(/); assert.match(source(path), /requestConcept\(/);
  }
  assert.doesNotMatch(source("app/api/try-demo/route.ts"), /Promise\.race/);
  assert.match(source("lib/concept-provider.ts"), /maxRetries: 0/);
  assert.match(source("lib/concept-provider.ts"), /AbortSignal.timeout\(timeoutMs\)/);
  assert.match(source("app/api/generate/route.ts"), /await meter\(0\)/);
});
test("all runtime model IDs are centralized", () => {
  function walk(dir: string): void { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name); if (entry.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) assert.doesNotMatch(readFileSync(p, "utf8"), /["']claude-(sonnet|haiku)-\d/, p);
  } }
  walk(join(root, "app/api"));
});
test("blog self-service CTA and free signup not email/paid checkout", () => {
  assert.match(source("components/BlogTryCta.tsx"), /\/try\?source=blog/);
  assert.doesNotMatch(source("components/BlogTryCta.tsx"), /mailto:|checkout/);
  assert.match(source("app/try/TryClient.tsx"), /href="\/login\?tab=signup"/);
});
test("feedback restored with paid social analytics opt-in and missing-data guard", () => {
  const feedback = source("app/api/cron/content-feedback/route.ts");
  assert.equal((feedback.match(/CONTENT_FEEDBACK_SOCIAL_ANALYTICS !== "enabled"/g) ?? []).length, 2);
  assert.match(feedback, /!process.env.CRON_SECRET/);
  assert.match(feedback, /default zeros are not proof/);
  const config = JSON.parse(readFileSync(join(root, "../vercel.json"), "utf8"));
  assert.equal(config.crons.filter((c: { path: string }) => c.path === "/api/cron/content-feedback").length, 1);
});
console.log(`continuous-improvement: ${passed} tests passed; inference calls = 0`);
