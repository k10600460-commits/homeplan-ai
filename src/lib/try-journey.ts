// Browser-only handoff, no identity/address and no new tracking cookie.
export const TRY_BRIEF_KEY = "splanai_try_brief_v1";
export const BRIEF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export interface TryBrief { lotSize: number; budget: number; savedAt: number }

export function parseTryBrief(raw: string | null, now = Date.now()): TryBrief | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as TryBrief;
    if (!b || typeof b !== "object" || !Number.isInteger(b.lotSize) || b.lotSize < 500 || b.lotSize > 1_000_000 ||
        ![250_000, 350_000, 500_000].includes(b.budget) || !Number.isFinite(b.savedAt) ||
        b.savedAt > now || now - b.savedAt > BRIEF_TTL_MS) return null;
    return { lotSize: b.lotSize, budget: b.budget, savedAt: b.savedAt };
  } catch { return null; }
}

// Only public, bounded article slugs enter first-party analytics, never URLs,
// raw referrers, user text or arbitrary query-string values.
export function tryAttribution(input: { source?: unknown; article?: unknown }) {
  const article = typeof input.article === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.article) && input.article.length <= 120
    ? input.article : undefined;
  return input.source === "blog" && article
    ? { entry_source: "blog", article_slug: article }
    : { entry_source: "direct", article_slug: undefined };
}
