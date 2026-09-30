/** Synthetic-only, bounded cross-provider benchmark. No DB, .env, publishing,
 * automatic model changes, paid retries, or unbounded model judge. */
import { createHash } from "node:crypto";
import { CONCEPT_VERSION, CONCEPT_PROMPT_VERSION, CONCEPT_EVALUATOR_VERSION, calculateConcepts, conceptIssues, prepareConceptsForDisplay, conceptJsonSchema, conceptPrompt, type ConceptBrief } from "../src/lib/concept-contract";
import { CONCEPT_CANDIDATES, ConceptProviderError, requestConcept, type ConceptModel, type OpenAITransport } from "../src/lib/concept-provider";
import { PlanOutputError } from "../src/lib/plan-output";

const CASES: Record<string, (ConceptBrief & { id: string })[]> = {
  us: [
    { id: "small-lot", market: "us", lotSize: 2500, budget: 250000, familySize: 2, state: "TX" },
    { id: "typical-lot", market: "us", lotSize: 8500, budget: 350000, familySize: 3, state: "NC" },
    { id: "larger-family", market: "us", lotSize: 15000, budget: 500000, familySize: 6, state: "AZ" },
  ],
  holdout: [
    { id: "us-compact-family", market: "us", lotSize: 4000, budget: 280000, familySize: 4, state: "OH" },
    { id: "us-large-family-tight-budget", market: "us", lotSize: 7200, budget: 380000, familySize: 7, state: "TX" },
    { id: "ca-family", market: "ca", lotSize: 6200, budget: 650000, familySize: 4, state: "ON" },
    { id: "au-family", market: "au", lotSize: 5382, budget: 650000, familySize: 4, state: "NSW" },
    { id: "nz-small-family", market: "nz", lotSize: 4844, budget: 600000, familySize: 3, state: null },
  ],
  demo: [
    { id: "demo-small", market: "us", lotSize: 3000, budget: 250000, familySize: 3, state: "TX" },
    { id: "demo-typical", market: "us", lotSize: 8500, budget: 350000, familySize: 3, state: "NC" },
    { id: "demo-large", market: "us", lotSize: 15000, budget: 500000, familySize: 3, state: "AZ" },
  ],
};
type Row = { model: ConceptModel; caseId: string; repeat: number; issues: string[]; deliveryIssues?: string[]; omittedProseClaims?: number; costUsd: number; durationMs: number; provider?: string; resolvedModel?: string; outputTokens?: number; inputTokens?: number; error?: string; httpStatus?: number };
function arg(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const emit = (kind: string, value: unknown) => console.log(`SPLANAI_BENCH_${kind}=` + JSON.stringify(value));
async function main() {
  const suite = arg("--suite") ?? "us";
  if (!CASES[suite]) throw new Error("unknown suite");
  const models = (arg("--models") ?? "claude-sonnet-5,claude-sonnet-5-5,claude-haiku-4-5,gpt-6-luna,gpt-6.1-sol").split(",") as ConceptModel[];
  if (models.some(m => !Object.hasOwn(CONCEPT_CANDIDATES, m)) || new Set(models).size !== models.length) throw new Error("unreviewed/duplicate model");
  const repeats = Number(arg("--repeats") ?? 2);
  if (![1, 2, 3].includes(repeats)) throw new Error("bounded repeats required");
  const openaiTransport = (arg("--openai-transport") ?? "direct") as OpenAITransport;
  if (!["direct", "gateway"].includes(openaiTransport)) throw new Error("invalid transport");
  const count = suite === "demo" ? 1 : 3;
  const schema = conceptJsonSchema(count);
  const spec = { version: CONCEPT_VERSION, promptVersion: CONCEPT_PROMPT_VERSION, evaluatorVersion: CONCEPT_EVALUATOR_VERSION, suite, cases: CASES[suite], models, repeats, count, openaiTransport, maxTokens: count === 1 ? 3000 : 8192, schema,
    prompts: CASES[suite].map(c => conceptPrompt(c, count)) };
  const specHash = createHash("sha256").update(JSON.stringify(spec)).digest("hex");
  const maxCost = Number(arg("--max-cost-usd"));
  const planned = { ...spec, specHash, requests: models.length * CASES[suite].length * repeats, productionChanged: false };
  if (!process.argv.includes("--allow-paid")) { emit("DRY_RUN", planned); return; }
  if (!process.argv.includes("--prices-reviewed") || !Number.isFinite(maxCost) || maxCost <= 0 || maxCost > 1.35) throw new Error("explicit price review and budget <= $1.35 required");
  // Vercel truncates an individual log event at 4KB. Keep the audit header
  // small; the full prompt/schema remain in dry-run output and the pinned code.
  emit("START", { ...planned, prompts: undefined, schema: undefined, maxCostUsd: maxCost });
  const rows: Row[] = [];
  const blocked = new Set<ConceptModel>();
  let spentUsd = 0, unknownReservedUsd = 0;
  let stopped: string | null = null;
  const deadline = Date.now() + 12 * 60_000;
  outer: for (let cidx = 0; cidx < CASES[suite].length; cidx++) for (let repeat = 0; repeat < repeats; repeat++) {
    const c = CASES[suite][cidx];
    const rotation = (cidx + repeat) % models.length;
    for (const model of [...models.slice(rotation), ...models.slice(0, rotation)]) {
      if (blocked.has(model)) continue;
      if (Date.now() > deadline - 60_000) { stopped = "deadline"; break outer; }
      const p = CONCEPT_CANDIDATES[model];
      const prompt = conceptPrompt(c, count);
      // Byte count + overhead is deliberately much more conservative than
      // tokens for these bounded English prompts. No calls to price unknown IDs.
      const inputCeiling = Buffer.byteLength(JSON.stringify({ ...prompt, schema }), "utf8") + 2000;
      const reserve = (inputCeiling * p.input * 1.25 + spec.maxTokens * p.output) / 1_000_000;
      if (spentUsd + unknownReservedUsd + reserve > maxCost) { stopped = "budget_limit"; break outer; }
      try {
        const response = await requestConcept({ model, ...prompt, schema, maxTokens: spec.maxTokens, openaiTransport });
        spentUsd += response.costUsd;
        let issues: string[];
        let deliveryIssues: string[] | undefined;
        let omittedProseClaims = 0;
        try {
          const plans = calculateConcepts(response.text, count, response.stopReason);
          issues = conceptIssues(plans, c);
          const display = prepareConceptsForDisplay(plans);
          deliveryIssues = conceptIssues(display, c);
          omittedProseClaims = display.reduce((n, p) => n + (p.omittedProseClaims ?? 0), 0);
          for (const plan of plans) emit("PLAN", { model, caseId: c.id, repeat, plan });
        } catch (error) { issues = error instanceof PlanOutputError ? [`invalid_output:${error.code}`, ...error.fields.map(f => `schema:${f}`)] : ["invalid_output"]; }
        const row: Row = { model, caseId: c.id, repeat, issues, deliveryIssues: deliveryIssues ?? issues, omittedProseClaims, costUsd: response.costUsd, durationMs: response.durationMs,
          provider: response.provider, resolvedModel: response.model, inputTokens: response.usage.input_tokens + response.usage.cache_read_input_tokens,
          outputTokens: response.usage.output_tokens };
        rows.push(row); emit("ROW", row);
      } catch (error) {
        // A failed/ambiguous call keeps its FULL reservation. Never retry it.
        unknownReservedUsd += reserve;
        blocked.add(model);
        const row: Row = { model, caseId: c.id, repeat, issues: ["provider_failure"], costUsd: 0, durationMs: 0,
          error: error instanceof ConceptProviderError ? error.code : "unexpected_error",
          httpStatus: error instanceof ConceptProviderError ? error.httpStatus : undefined };
        rows.push(row); emit("ROW", row);
      }
    }
  }
  const summary = models.map(model => {
    const group = rows.filter(r => r.model === model);
    const accepted = group.filter(r => !r.issues.length);
    const costs = group.reduce((n, r) => n + r.costUsd, 0);
    const durations = group.filter(r => !r.error).map(r => r.durationMs).sort((a, b) => a - b);
    return { model, expected: CASES[suite].length * repeats, completed: group.filter(r => !r.error).length, passed: accepted.length,
      deliveryPassed: group.filter(r => !(r.deliveryIssues ?? r.issues).length).length,
      omittedProseClaims: group.reduce((n, r) => n + (r.omittedProseClaims ?? 0), 0),
      costUsd: costs, costPerPassingProposalUsd: accepted.length ? costs / (accepted.length * count) : null,
      meanMs: durations.length ? durations.reduce((n, d) => n + d, 0) / durations.length : null,
      p95Ms: durations[Math.ceil(durations.length * .95) - 1] ?? null, issues: group.flatMap(r => r.issues),
      eligibleForHumanReview: !blocked.has(model) && accepted.length === CASES[suite].length * repeats,
    };
  });
  emit("SUMMARY", { specHash, version: CONCEPT_VERSION, suite, count, repeats, models, stopped, spentUsd, unknownReservedUsd,
    maximumAccountedUsd: spentUsd + unknownReservedUsd, summary, inferenceRows: rows.length, productionChanged: false,
    limits: "Arithmetic totals are guaranteed by the ledger, not proof of model reasoning. Mechanical checks are NOT architectural or buyer-usefulness validation." });
  if (stopped || blocked.size) process.exitCode = 2;
}
main().catch(() => { console.error("SPLANAI_BENCH_REFUSED: check reviewed models, prices and approved budget; no secrets printed"); process.exitCode = 1; });
