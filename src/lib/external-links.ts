/**
 * Best-effort Zillow address search URL.
 * Converts an address string into Zillow's /homes/{slug}_rb/ pattern.
 * This is a search link, not a guaranteed deep-link — Zillow may redirect.
 * Returns null for empty input.
 */
export function zillowSearchUrl(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  // Hyphenate word-spaces; keep commas, hyphens, periods, # (unit numbers)
  const slug = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-,\.#]/g, "");
  if (!slug) return null;
  return `https://www.zillow.com/homes/${slug}_rb/`;
}
