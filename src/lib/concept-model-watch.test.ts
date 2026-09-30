import assert from "node:assert/strict";
import { inspectConceptCatalog } from "./concept-model-watch";
const row = (id: string, input: number, output: number, cached: number) => ({ id, pricing: { input: String(input / 1e6), output: String(output / 1e6), input_cache_read: String(cached / 1e6) } });
const data = [row("anthropic/claude-sonnet-5", 2, 10, .2), row("anthropic/claude-sonnet-5.5", 2, 10, .2), row("anthropic/claude-haiku-4.5", 1, 5, .1),
  row("openai/gpt-6-luna", .1, .5, .01), row("openai/gpt-6.1-sol", 2, 10, .1), row("openai/gpt-6-sol", 2, 10, .2), row("openai/gpt-6-astra", 10, 50, 1)];
assert.equal(inspectConceptCatalog({ data }).needsReview, false);
assert.equal(inspectConceptCatalog({ data: data.slice(1) }).needsReview, true);
assert.equal(inspectConceptCatalog({ data: data.map((r, i) => i === 0 ? row(r.id, 3, 10, .2) : r) }).needsReview, true);
const updated = inspectConceptCatalog({ data: [...data, row("openai/gpt-6.2-luna", .1, .5, .01)] });
assert.deepEqual(updated.newCandidates, ["openai/gpt-6.2-luna"]);
assert.equal(updated.automaticModelChange, false); assert.equal(updated.inferenceCalls, 0);
for (const bad of [null, {}, { data: [] }, { data: [{}] }]) assert.throws(() => inspectConceptCatalog(bad));
console.log("PASS cross-provider catalog: unchanged, missing, changed price, new GPT, no inference/promotion, malformed sources");
