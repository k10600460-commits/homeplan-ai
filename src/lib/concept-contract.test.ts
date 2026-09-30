import assert from "node:assert/strict";
import { calculateConcepts, conceptIssues, conceptJsonSchema, conceptPrompt, CONCEPT_VERSION, type ConceptBrief } from "./concept-contract";
import { conceptCost, normalizeOpenAIUsage } from "./concept-provider";
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
test("same contract parses a demo and a three-plan proposal", () => {
  assert.equal(parse().length, 1);
  const plans = calculateConcepts(JSON.stringify({ plans: [1, 2, 3].map((id, i) => ({ ...draft, id, style: ["Craftsman", "Contemporary", "Ranch"][i] })) }), 3, "end_turn");
  assert.equal(plans.length, 3); assert.deepEqual(conceptIssues(plans, brief), []);
});
console.log(`${passed} concept contract tests passed`);
