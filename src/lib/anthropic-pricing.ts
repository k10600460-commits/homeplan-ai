// Anthropic per-model pricing table (USD per 1,000,000 tokens).
//
// Used ONLY to ESTIMATE the cost of the app's daily Claude cron群 for the
// cron_costs observability table (W0). This is a passive record layer — it never
// bills, never calls an API, and never gates a request. Estimates are used to
// surface month-to-date spend and spike alerts in the daily brief.
//
// Source: Anthropic published pricing (claude-api skill cache, 2026-06-24).
// Rates are per 1M tokens. Only the models the cron群 actually call are load-
// bearing today (Haiku 4.5 + Sonnet 4.6); the rest are listed for completeness
// and forward-compatibility. When a new model id starts being used, add its row.
//
// RULE: never fabricate a price. If a model id is unrecognized we fall back to a
// deliberately HIGH estimate (see FALLBACK_PRICE) so we over-report rather than
// silently under-report a runaway spend.

export interface ModelPrice {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

// Keys are matched by PREFIX against the model id, so dated snapshots such as
// "claude-haiku-4-5-20251001" match the "claude-haiku-4-5" row. Longer keys are
// tried first (see priceForModel) so a more specific id wins.
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Haiku 4.5 — fb-draft, nurture-scan, legal-watch, reply-watch, daily-brief翻訳
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  // Sonnet 4.6 — daily-brief research (web_search + submit_research)
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  // 要確認: Sonnet 5 has an intro rate of $2/$10 per MTok through 2026-08-31;
  // standard is $3/$15. We use the higher STANDARD rate so estimates stay
  // conservative (over-report) if intro pricing lapses. Not used by any cron yet.
  "claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  // Opus tier — not used by cron群 today; listed for completeness.
  "claude-opus-4-8": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  "claude-opus-4-7": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  "claude-opus-4-6": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  // Fable 5 — most expensive current tier; listed so an accidental cron use is
  // priced correctly rather than hitting the fallback.
  "claude-fable-5": { inputPerMTok: 10.0, outputPerMTok: 50.0 },
};

// Conservative fallback for an unrecognized model id. Set to the highest current
// published tier (Fable 5, $10/$50 per MTok) so an unknown model over-reports
// rather than under-reports. 要確認: if Anthropic ships a pricier tier than Fable 5,
// raise this floor.
export const FALLBACK_PRICE: ModelPrice = { inputPerMTok: 10.0, outputPerMTok: 50.0 };

/**
 * Resolve the price row for a model id (prefix match, longest key first).
 * `matched: false` means the fallback high estimate was used — surfaced so a
 * caller/logger can flag an untracked model.
 */
export function priceForModel(model: string): { price: ModelPrice; matched: boolean } {
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return { price: MODEL_PRICING[key], matched: true };
  }
  return { price: FALLBACK_PRICE, matched: false };
}

/**
 * Estimate the USD cost of one Claude call from its token usage.
 * Pure and defensive: negative / NaN / missing token counts are treated as 0.
 * Rounded to 6 decimals (micro-dollar) — enough precision for per-call rows.
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number {
  const { price } = priceForModel(model);
  const inTok = Number.isFinite(inputTokens) && (inputTokens as number) > 0 ? (inputTokens as number) : 0;
  const outTok = Number.isFinite(outputTokens) && (outputTokens as number) > 0 ? (outputTokens as number) : 0;
  const cost = (inTok / 1_000_000) * price.inputPerMTok + (outTok / 1_000_000) * price.outputPerMTok;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
