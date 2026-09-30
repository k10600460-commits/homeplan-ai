import { CONCEPT_CANDIDATES } from "./concept-provider";

export const CONCEPT_CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
// Catalog review is not runtime approval. Premium Astra is observed for change,
// not added to the inference allowlist or selected for cost-sensitive requests.
const catalogBaseline: Record<string, { input: number; output: number; cached: number }> = {
  ...Object.fromEntries(Object.entries(CONCEPT_CANDIDATES).map(([id, p]) => {
    const gatewayId = id === "claude-sonnet-5-5" ? "claude-sonnet-5.5" : id === "claude-haiku-4-5" ? "claude-haiku-4.5" : id;
    return [`${p.provider === "openai" ? "openai" : "anthropic"}/${gatewayId}`, { input: p.input, output: p.output, cached: p.cached }];
  })),
  "openai/gpt-6-sol": { input: 2, output: 10, cached: .2 },
  "openai/gpt-6-astra": { input: 10, output: 50, cached: 1 },
};
type Entry = { id: string; pricing?: { input?: string; output?: string; input_cache_read?: string } };
export function inspectConceptCatalog(value: unknown) {
  const data = (value as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || !data.length || data.some(e => !e || typeof e.id !== "string")) throw new Error("Invalid public model catalog");
  const entries = new Map((data as Entry[]).map(e => [e.id, e]));
  const checks = Object.entries(catalogBaseline).map(([id, expected]) => {
    const entry = entries.get(id);
    const rate = (raw: string | undefined) => raw === undefined ? null : Number(raw) * 1_000_000;
    const actual = { input: rate(entry?.pricing?.input), output: rate(entry?.pricing?.output), cached: rate(entry?.pricing?.input_cache_read) };
    const changed = !entry || (Object.keys(expected) as (keyof typeof expected)[]).some(k => actual[k] === null || !Number.isFinite(actual[k]) || Math.abs(actual[k]! - expected[k]) > 1e-8);
    return { id, found: !!entry, expectedUsdPerMTok: expected, actualUsdPerMTok: actual, needsReview: changed };
  });
  const newCandidates = [...entries.keys()].filter(id => /^openai\/gpt-(\d+)/.test(id) &&
    Number(id.match(/^openai\/gpt-(\d+)/)![1]) >= 6 && !/-fast$/.test(id) && !Object.hasOwn(catalogBaseline, id));
  return { checkedAgainst: "2026-09-30 reviewed public catalog", checks, newCandidates,
    needsReview: checks.some(c => c.needsReview) || newCandidates.length > 0,
    inferenceCalls: 0, automaticModelChange: false, automaticPriceChange: false,
    warning: "Catalog presence/pricing does not establish account access, provider availability or task quality. Paid evaluation and release review are separate." };
}
