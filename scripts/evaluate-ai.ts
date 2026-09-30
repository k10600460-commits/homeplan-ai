/** Default is an offline plan. Paid use requires ALL explicit CLI gates below.
 * Does not read .env files, query production data, edit config, or deploy.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS, EVALUATION_MODELS, type GenerationRole } from "../src/lib/ai-models";
import { priceForModel, estimateGenerationCostUsd } from "../src/lib/anthropic-pricing";
import { EVAL_CASES, assessEvaluation, evaluationPrompt, type EvaluationRow } from "../src/lib/ai-evaluation";
import { parsePlanOutput, planQualityIssues } from "../src/lib/plan-output";

function arg(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }

async function main() {
  const role = arg("--role") ?? "proposal";
  if (role !== "proposal" && role !== "demo") throw new Error("role must be proposal or demo");
  const candidate = arg("--candidate");
  if (!candidate || !EVALUATION_MODELS.includes(candidate) || !priceForModel(candidate).matched) throw new Error("candidate must have reviewed pricing and be explicitly allowed");
  const baseline = AI_MODELS[role as GenerationRole].model;
  const plan = { role, baseline, candidate, cases: EVAL_CASES.map(c => c.id), repeats: 2, requests: EVAL_CASES.length * 4,
    productionChanged: false, scope: "US concepts only; other markets and editorial/research roles need separate review" };
  if (!process.argv.includes("--allow-paid")) {
    console.log(JSON.stringify({ status: "dry_run_no_api_calls", ...plan }, null, 2));
    return;
  }
  const maxCost = Number(arg("--max-cost-usd"));
  if (!Number.isFinite(maxCost) || maxCost <= 0 || maxCost > 5 || !process.argv.includes("--prices-reviewed")) {
    throw new Error("Paid run requires --prices-reviewed and --max-cost-usd (0 < cap <= 5). Obtain owner approval first.");
  }
  if (candidate === baseline) throw new Error("candidate must differ from baseline");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("API credential must be supplied securely by the operator; .env files are never loaded");
  const client = new Anthropic({ timeout: 45_000, maxRetries: 0 });
  const rows: EvaluationRow[] = [];
  let reservedUsd = 0;
  const deadline = Date.now() + 10 * 60_000;
  let stopped: string | null = null;
  outer: for (const c of EVAL_CASES) for (let repeat = 0; repeat < 2; repeat++) {
    // Alternating order reduces warm-cache/order bias; prompts are the same.
    const variants = repeat % 2 ? ["candidate", "baseline"] as const : ["baseline", "candidate"] as const;
    for (const variant of variants) {
      const model = variant === "baseline" ? baseline : candidate;
      const { price, matched } = priceForModel(model);
      if (!matched) { stopped = "unreviewed_price"; break outer; }
      const request = { ...evaluationPrompt(role, c), model };
      if (Date.now() > deadline - 90_000) { stopped = "deadline"; break outer; }
      try {
        const counted = await client.messages.countTokens({ model, system: request.system, messages: request.messages, ...(role === "proposal" ? { thinking: { type: "disabled" as const } } : {}) });
        // Reserve before dispatch, including failed/ambiguous requests. Never
        // refund on an API error. This is an estimate, not an account billing cap.
        const reserve = ((counted.input_tokens * 1.2 + 1000) * price.inputPerMTok + request.max_tokens * price.outputPerMTok) / 1_000_000;
        if (!Number.isFinite(reserve) || reserve <= 0 || reservedUsd + reserve > maxCost) { stopped = "budget_reservation_limit"; break outer; }
        reservedUsd += reserve;
        const started = Date.now();
        const response = await client.messages.create(request);
        const durationMs = Date.now() - started;
        const block = response.content.find(b => b.type === "text");
        const issues: string[] = [];
        try { issues.push(...planQualityIssues(parsePlanOutput(block?.type === "text" ? block.text : "", role === "demo" ? 1 : 3, response.stop_reason), c.budget)); }
        catch { issues.push("invalid_output"); }
        const costUsd = estimateGenerationCostUsd(model, response.usage);
        rows.push({ variant, caseId: c.id, repeat, model, durationMs, costUsd, issues });
      } catch {
        // No response body, prompts or secrets go into logs. Stop rather than
        // retry an unknown-cost failure or automatically choose another model.
        stopped = "api_or_count_failure";
        break outer;
      }
    }
  }
  const assessment = assessEvaluation(rows);
  console.log(JSON.stringify({ ...plan, ...assessment, stopped, reservedUsd, rows, humanReview: "Inspect PDF/portal and usefulness before release; no automatic promotion." }, null, 2));
  if (stopped || assessment.status !== "eligible_for_human_review") process.exitCode = 2;
}
main().catch(() => { console.error("AI evaluation refused/failed. Check arguments, reviewed prices and approved budget; no config was changed."); process.exitCode = 1; });
