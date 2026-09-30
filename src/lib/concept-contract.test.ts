import assert from "node:assert/strict";
import { acceptConcepts, ConceptQualityError, calculateConcepts, conceptIssues, conceptJsonSchema, conceptPrompt, CONCEPT_VERSION, type ConceptBrief } from "./concept-contract";
import { conceptCost, normalizeOpenAIUsage, isExpectedConceptModel } from "./concept-provider";
import { conceptAreaNote } from "./concept-disclosure";
const brief: ConceptBrief = { market: "us", lotSize: 8500, budget: 350000, familySize: 3 };
const draft = { id: 1, name: "The Cedar", style: "Craftsman", stories: 1, garages: 1, estimatedCost: 220000,
  description: "Kitchen opens onto the Great Room. Private bedrooms sit off a separate hall.", features: ["Separate bedroom hall"], highlights: ["A compact footprint keeps the yard open"],
  rooms: [
    { name: "Primary Bedroom", sqft: 160, kind: "bedroom" }, { name: "Bedroom 2", sqft: 120, kind: "bedroom" }, { name: "Bedroom 3", sqft: 120, kind: "bedroom" },
    { name: "Primary Bath", sqft: 60, kind: "full_bath" }, { name: "Powder Room", sqft: 30, kind: "half_bath" },
    { name: "Kitchen", sqft: 150, kind: "living" }, { name: "Great Room", sqft: 260, kind: "living" },
    { name: "Hallways, walls and circulation", sqft: 100, kind: "circulation" }, { name: "Garage", sqft: 250, kind: "garage" },
  ] };
let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log("PASS " + name); }
const parse = (p = draft) => calculateConcepts(JSON.stringify({ plans: [p] }), 1, "end_turn");
test("numeric totals derive once from the room ledger, garage excluded", () => {
  const [p] = parse(); assert.equal(p.squareFootage, 1000); assert.equal(p.bedrooms, 3); assert.equal(p.bathrooms, 1.5); assert.equal(p.calculationBasis, CONCEPT_VERSION);
  assert.deepEqual(conceptIssues([p], brief), []); assert.equal("squareFootage" in draft, false);
});
test("model-supplied competing totals are rejected, never silently repaired", () => assert.throws(() => parse({ ...draft, squareFootage: 999 } as typeof draft), /INVALID_SCHEMA/));
test("partial JSON completion is rejected", () => assert.throws(() => calculateConcepts(JSON.stringify({ plans: [draft] }), 1, "max_tokens"), /TRUNCATED/));
test("no empty, duplicate or wrong-number concepts", () => {
  assert.throws(() => calculateConcepts('{"plans":[]}', 1, "end_turn"));
  assert.throws(() => calculateConcepts(JSON.stringify({ plans: [draft, draft, draft] }), 3, "end_turn"));
});
test("invalid numeric room data cannot enter UI/PDF", () => {
  for (const sqft of [0, -5, "100", null]) assert.throws(() => parse({ ...draft, rooms: [{ ...draft.rooms[0], sqft }, ...draft.rooms.slice(1)] } as typeof draft));
});
test("wrong room classification is not accepted as false numeric accuracy", () => {
  const p = parse({ ...draft, rooms: draft.rooms.map(r => r.name === "Bedroom 3" ? { ...r, kind: "service" } : r) });
  assert.ok(conceptIssues(p, brief).includes("plan_1:room_kind_name_mismatch"));
  assert.ok(conceptIssues(p, brief).includes("plan_1:insufficient_bedrooms"));
});
test("a bedroom closet is storage, and a family room is a living room", () => {
  const p = parse({ ...draft, rooms: [...draft.rooms.map(r => r.name === "Great Room" ? { ...r, name: "Family Room" } : r),
    { name: "Bedroom 2 Closet", sqft: 15, kind: "service" }, { name: "Bedroom Closets", sqft: 20, kind: "service" },
    { name: "Bedroom Hallway", sqft: 30, kind: "circulation" }, { name: "Entry and Coat Storage", sqft: 35, kind: "circulation" }] });
  assert.deepEqual(conceptIssues(p, brief), []);
  p[0].rooms.at(-3)!.kind = "bedroom";
  assert.ok(conceptIssues(p, brief).includes("plan_1:storage_counted_as_room"));
  p[0].rooms.at(-2)!.kind = "bedroom";
  assert.ok(conceptIssues(p, brief).includes("plan_1:circulation_counted_as_bedroom"));
});
test("small-lot prompt supplies a calculated footprint cap without claiming compliance", () => {
  const p = conceptPrompt({ ...brief, lotSize: 2500 }, 3);
  assert.match(p.user, /limit: 1000 sqft/); assert.match(p.system, /Circulation IS included/);
});
test("budget and household requirements are checked", () => {
  const issues = conceptIssues(parse(), { ...brief, budget: 100000, familySize: 7 });
  assert.ok(issues.includes("plan_1:over_budget")); assert.ok(issues.includes("plan_1:insufficient_bedrooms"));
});
test("footprint is a clearly named concept assumption, not zoning validation", () => assert.ok(conceptIssues(parse(), { ...brief, lotSize: 2500 }).includes("plan_1:footprint_exceeds_concept_assumption")));
test("full bath, kitchen, living, circulation and garage checks", () => {
  const p = parse({ ...draft, rooms: draft.rooms.filter(r => !["Kitchen", "Great Room", "Garage"].includes(r.name) && r.kind !== "circulation") });
  const issues = conceptIssues(p, brief); for (const suffix of ["missing_kitchen", "missing_living_room", "missing_circulation_allowance", "garage_schedule_mismatch"]) assert.ok(issues.includes("plan_1:" + suffix));
});
test("schema is required-field strict and excludes independently generated totals", () => {
  const schema = JSON.stringify(conceptJsonSchema(3)); assert.ok(schema.includes('"additionalProperties":false'));
  for (const key of ["squareFootage", "bedrooms", "bathrooms", "exclusiveMinimum"]) assert.ok(!schema.includes('"' + key + '"'));
});
test("wire schema uses required named slots, never an unconstrained plans array", () => {
  for (const count of [1, 3] as const) {
    const schema = conceptJsonSchema(count);
    assert.deepEqual(schema.required, count === 1 ? ["plan1"] : ["plan1", "plan2", "plan3"]);
    const wire = Object.fromEntries(Array.from({ length: count }, (_, i) => [`plan${i + 1}`, { ...draft, id: i + 1, style: `Style ${i + 1}` }]));
    assert.equal(acceptConcepts(JSON.stringify(wire), count, "end_turn", brief).length, count);
  }
  assert.throws(() => calculateConcepts(JSON.stringify({ plan1: draft, plan2: draft }), 1, "end_turn"));
  assert.throws(() => calculateConcepts(JSON.stringify({ plan1: draft }), 3, "end_turn"));
});
test("inconsistent concepts fail before UI/PDF without silently changing numbers", () => {
  assert.throws(() => acceptConcepts(JSON.stringify({ plan1: draft }), 1, "end_turn", { ...brief, budget: 100000 }), ConceptQualityError);
  assert.equal(draft.estimatedCost, 220000);
});
test("prose cannot reintroduce conflicting areas/cost savings or floor counts", () => {
  for (const highlight of ["2950 sqft interior leaves 5270 sqft yard", "Saves $30k on building cost", "Only two thousand square feet", "Two-story living layout"]) {
    assert.throws(() => acceptConcepts(JSON.stringify({ plan1: { ...draft, highlights: [highlight] } }), 1, "end_turn", brief), ConceptQualityError);
  }
});
test("new disclosure agrees with ledger; old plans are not described as recalculated", () => {
  assert.match(conceptAreaNote({ calculationBasis: CONCEPT_VERSION }), /including circulation/);
  assert.match(conceptAreaNote({}), /may not reconcile/);
});
test("Canadian, Australian, NZ and US prompts retain internal sqft and local currencies", () => {
  for (const market of ["us", "ca", "au", "nz"] as const) {
    const p = conceptPrompt({ ...brief, market }, 3);
    assert.match(p.system, /square feet/); assert.match(p.system, /NOT verified zoning/); assert.match(p.user, /at least 3 bedrooms/);
  }
  assert.match(conceptPrompt({ ...brief, market: "au" }, 3).system, /AUD/);
  assert.match(conceptPrompt({ ...brief, market: "ca" }, 3).system, /CAD/);
});
test("OpenAI cached input is not billed twice and output includes reasoning", () => {
  const u = normalizeOpenAIUsage({ input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 2000 });
  assert.equal(u.input_tokens, 600); assert.equal(u.cache_read_input_tokens, 400);
  assert.ok(Math.abs(conceptCost("gpt-6-luna", u) - .001064) < 1e-10);
});
test("invalid usage fails rather than claiming zero-cost inference", () => {
  for (const u of [undefined, {}, { input_tokens: -1, output_tokens: 2 }, { input_tokens: 1, output_tokens: 2, input_tokens_details: { cached_tokens: 3 } }]) assert.throws(() => normalizeOpenAIUsage(u), /INVALID_USAGE/);
});
test("provider cannot silently substitute a model; dated snapshots are explicit aliases", () => {
  assert.equal(isExpectedConceptModel("claude-haiku-4-5", "claude-haiku-4-5-20251001"), true);
  assert.equal(isExpectedConceptModel("gpt-6-luna", "gpt-6-luna-2026-09-22"), true);
  assert.equal(isExpectedConceptModel("claude-sonnet-5", "claude-sonnet-5-5"), false);
  assert.equal(isExpectedConceptModel("gpt-6-luna", "gpt-6-luna-2026-fallback"), false);
});
test("same contract parses a demo and a three-plan proposal", () => {
  assert.equal(parse().length, 1);
  const plans = calculateConcepts(JSON.stringify({ plans: [1, 2, 3].map((id, i) => ({ ...draft, id, style: ["Craftsman", "Contemporary", "Ranch"][i] })) }), 3, "end_turn");
  assert.equal(plans.length, 3); assert.deepEqual(conceptIssues(plans, brief), []);
});
console.log(`${passed} concept contract tests passed`);
