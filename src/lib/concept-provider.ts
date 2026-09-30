import Anthropic from "@anthropic-ai/sdk";
import { estimateGenerationCostUsd } from "./anthropic-pricing";

/** Manually reviewed 2026-09-30 against vendor docs AND Gateway catalog.
 * Selection is never automatic; default transport remains Anthropic direct. */
export const CONCEPT_CANDIDATES = {
  "claude-sonnet-5": { provider: "anthropic", input: 2, output: 10, cached: 0.2, reasoning: "disabled" },
  "claude-sonnet-5-5": { provider: "anthropic", input: 2, output: 10, cached: 0.2, reasoning: "between_tools" },
  "claude-haiku-4-5": { provider: "anthropic", input: 1, output: 5, cached: 0.1, reasoning: "disabled" },
  "gpt-6-luna": { provider: "openai", input: 0.1, output: 0.5, cached: 0.01, reasoning: "low" },
  "gpt-6.1-sol": { provider: "openai", input: 2, output: 10, cached: 0.1, reasoning: "low" },
} as const;
export type ConceptModel = keyof typeof CONCEPT_CANDIDATES;
export type OpenAITransport = "direct" | "gateway";
export type ConceptUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
export type ConceptResponse = { id: string; model: string; requestedModel: ConceptModel; provider: string; text: string; stopReason: string | null; usage: ConceptUsage; costUsd: number; durationMs: number };
export class ConceptProviderError extends Error {
  constructor(public readonly code: string, public readonly httpStatus?: number) { super(code); }
}
export function normalizeOpenAIUsage(value: unknown): ConceptUsage {
  const u = value as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null;
  if (!u || !Number.isFinite(u.input_tokens) || !Number.isFinite(u.output_tokens) || (u.input_tokens ?? -1) < 0 || (u.output_tokens ?? -1) < 0) throw new ConceptProviderError("INVALID_USAGE");
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  if (!Number.isFinite(cached) || cached < 0 || cached > u.input_tokens!) throw new ConceptProviderError("INVALID_USAGE");
  // Responses input_tokens INCLUDES cache hits. Anthropic-style accounting does not.
  return { input_tokens: u.input_tokens! - cached, output_tokens: u.output_tokens!, cache_read_input_tokens: cached, cache_creation_input_tokens: 0 };
}
export function conceptCost(model: ConceptModel, usage: ConceptUsage): number {
  const p = CONCEPT_CANDIDATES[model];
  if (p.provider === "anthropic") return estimateGenerationCostUsd(model, usage);
  return (usage.input_tokens * p.input + usage.output_tokens * p.output + usage.cache_read_input_tokens * p.cached + usage.cache_creation_input_tokens * p.input * 1.25) / 1_000_000;
}
export async function requestConcept(args: {
  model: ConceptModel; system: string; user: string; schema: Record<string, unknown>;
  maxTokens?: number; timeoutMs?: number; openaiTransport?: OpenAITransport;
}): Promise<ConceptResponse> {
  const { model, system, user, schema, maxTokens = 8192, timeoutMs = 45_000, openaiTransport = "direct" } = args;
  const config = CONCEPT_CANDIDATES[model];
  if (!config) throw new ConceptProviderError("UNREVIEWED_MODEL");
  const started = Date.now();
  try {
    if (config.provider === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) throw new ConceptProviderError("ANTHROPIC_NOT_CONFIGURED");
      const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
      const response = await client.messages.create({
        model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
        thinking: { type: config.reasoning } as Anthropic.ThinkingConfigParam,
        output_config: { format: { type: "json_schema", schema } },
      });
      const usage = { ...response.usage, cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0 };
      return { id: response.id, model: response.model, requestedModel: model, provider: "anthropic-direct", text: response.content.filter(b => b.type === "text").map(b => b.text).join(""), stopReason: response.stop_reason, usage, costUsd: conceptCost(model, usage), durationMs: Date.now() - started };
    }
    const gateway = openaiTransport === "gateway";
    const key = gateway ? process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN : process.env.OPENAI_API_KEY;
    if (!key) throw new ConceptProviderError(gateway ? "GATEWAY_NOT_CONFIGURED" : "OPENAI_NOT_CONFIGURED");
    const response = await fetch(gateway ? "https://ai-gateway.vercel.sh/v1/responses" : "https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: gateway ? `openai/${model}` : model, instructions: system, input: user,
        max_output_tokens: maxTokens, reasoning: { effort: config.reasoning }, store: false,
        text: { format: { type: "json_schema", name: "residential_concepts", strict: true, schema } },
      }),
    });
    if (!response.ok) throw new ConceptProviderError("OPENAI_HTTP_ERROR", response.status);
    const data = await response.json();
    const usage = normalizeOpenAIUsage(data.usage);
    const output = Array.isArray(data.output) ? data.output : [];
    const text = output.filter((b: { type: string }) => b.type === "message").flatMap((b: { content?: { type: string; text?: string }[] }) => b.content ?? [])
      .filter((b: { type: string }) => b.type === "output_text").map((b: { text?: string }) => b.text ?? "").join("");
    const resolvedModel = String(data.model ?? model).replace(/^openai\//, "");
    if (resolvedModel !== model && !resolvedModel.startsWith(model + "-2026-")) throw new ConceptProviderError("UNEXPECTED_MODEL");
    return { id: String(data.id ?? ""), model: resolvedModel, requestedModel: model, provider: gateway ? "vercel-gateway-openai" : "openai-direct", text,
      stopReason: data.status === "completed" ? "end_turn" : data.status ?? "incomplete", usage, costUsd: conceptCost(model, usage), durationMs: Date.now() - started };
  } catch (e) {
    if (e instanceof ConceptProviderError) throw e;
    if (e instanceof Anthropic.APIError) throw new ConceptProviderError("ANTHROPIC_API_ERROR", e.status);
    throw new ConceptProviderError("TIMEOUT_OR_NETWORK_ERROR");
  }
}
