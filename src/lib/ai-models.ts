/** Production choices are pinned here, never selected by a "latest" lookup.
 * A new model is only a candidate until the benchmark AND human release review pass.
 * Keep roles separate: success on floor plans is not proof for research or copy.
 */
export const AI_MODELS = {
  proposal: { model: "claude-sonnet-5", maxTokens: 8192, promptVersion: "room-ledger-v4-2026-09-30", timeoutMs: 45_000 },
  demo: { model: "claude-haiku-4-5", maxTokens: 3000, promptVersion: "room-ledger-v4-2026-09-30", timeoutMs: 45_000 },
  editorial: { model: "claude-haiku-4-5-20251001" },
  research: { model: "claude-sonnet-5" },
} as const;

export type GenerationRole = "proposal" | "demo";

// Account-specific availability and price must still be verified before a paid run.
// These are benchmark estimates, not a billing ledger or a permission to spend.
export const EVALUATION_MODELS: readonly string[] = [
  "claude-sonnet-5", "claude-sonnet-5-5", "claude-haiku-4-5", "claude-haiku-4-5-20251001",
];
