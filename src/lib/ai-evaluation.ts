import { AI_MODELS, type GenerationRole } from "./ai-models";
import { DEMO_SYSTEM_PROMPT, demoUserPrompt, marketSystemPrompt, proposalUserPrompt } from "./ai-prompts";
import type { Market } from "./market";

// Synthetic briefs only. Never load customer plans, emails, addresses or DB rows.
export const EVAL_CASES = [
  { id: "small-lot", lotSize: 2500, budget: 250_000, familySize: 2, market: "us", state: "TX" },
  { id: "typical-lot", lotSize: 8500, budget: 350_000, familySize: 3, market: "us", state: "NC" },
  { id: "larger-family", lotSize: 15000, budget: 500_000, familySize: 6, market: "us", state: "AZ" },
] as const;

export function evaluationPrompt(role: GenerationRole, c: { lotSize: number; budget: number; familySize: number; market: Market; state: string }, model: string = AI_MODELS[role].model) {
  return {
    system: role === "demo" ? DEMO_SYSTEM_PROMPT : marketSystemPrompt(c.market),
    messages: [{ role: "user" as const, content: role === "demo" ? demoUserPrompt(c) : proposalUserPrompt(c) }],
    max_tokens: AI_MODELS[role].maxTokens,
    // Sonnet 5.5 rejects disabled (400); between_tools is its documented
    // no-up-front-thinking equivalent for requests without tools. This is an
    // evaluation-only compatibility adapter, not a production model switch.
    thinking: model === "claude-sonnet-5-5" ? { type: "between_tools" as const } : role === "proposal" ? { type: "disabled" as const } : undefined,
  };
}

export type EvaluationRow = {
  variant: "baseline" | "candidate";
  caseId: string;
  repeat: number;
  model: string;
  durationMs: number;
  costUsd: number;
  issues: string[];
};

function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
}

/** Necessary, not sufficient: PDF/portal quality and buyer usefulness need a human. */
export function assessEvaluation(rows: EvaluationRow[], repeats = 2) {
  const reasons: string[] = [];
  const expected = EVAL_CASES.length * repeats;
  const groups = ["baseline", "candidate"].map(variant => rows.filter(r => r.variant === variant));
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const keys = new Set(group.map(r => `${r.caseId}:${r.repeat}`));
    if (group.length !== expected || keys.size !== expected ||
        EVAL_CASES.some(c => Array.from({ length: repeats }, (_, i) => i).some(i => !keys.has(`${c.id}:${i}`)))) reasons.push("incomplete_or_duplicate_cases");
    if (new Set(group.map(r => r.model)).size !== 1) reasons.push("inconsistent_model");
    if (group.some(r => !Number.isFinite(r.costUsd) || r.costUsd < 0 || !Number.isFinite(r.durationMs) || r.durationMs <= 0)) reasons.push("invalid_measurement");
  }
  const [baseline, candidate] = groups;
  if (candidate.some(r => r.issues.length)) reasons.push("candidate_quality_failure");
  if (baseline.some(r => r.issues.length)) reasons.push("baseline_needs_review");
  const baselineCost = baseline.reduce((n, r) => n + r.costUsd, 0);
  const candidateCost = candidate.reduce((n, r) => n + r.costUsd, 0);
  if (candidateCost > baselineCost * 1.1) reasons.push("cost_regression_over_10_percent");
  if (p95(candidate.map(r => r.durationMs)) > Math.min(45_000, p95(baseline.map(r => r.durationMs)) * 1.2)) reasons.push("latency_regression");
  return { status: reasons.length ? "hold" : "eligible_for_human_review", reasons: [...new Set(reasons)],
    baselineCostUsd: baselineCost, candidateCostUsd: candidateCost,
    candidateP95Ms: p95(candidate.map(r => r.durationMs)), automaticallyPromoted: false };
}
