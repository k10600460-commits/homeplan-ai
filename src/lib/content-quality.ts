// src/lib/content-quality.ts
// Single source of truth for blog content quality rules. Used by BOTH the
// generator (seo-draft) and the publish gate (seo-publish) so they can never
// drift. Intentionally EXCLUDES "seamless" / "disrupt" — normal home-building
// vocabulary (seamless gutters, market disruption) that would wrongly skip
// good drafts.
export const BODY_MIN_LENGTH = 600;
export const DESCRIPTION_MIN_LENGTH = 110;
export const DESCRIPTION_MAX_LENGTH = 170;

const BANNED_TERMS = [
  { label: "AI-powered", regex: /\bai[- ]powered\b/i },
  { label: "game-changing", regex: /\bgame[- ]chang/i },
  { label: "revolutionize", regex: /\brevolutioniz/i },
  { label: "revolutionary", regex: /\brevolutionary\b/i },
  { label: "cutting-edge", regex: /\bcutting[- ]edge\b/i },
  { label: "best-in-class", regex: /\bbest[- ]in[- ]class\b/i },
  { label: "synergy", regex: /\bsynerg/i },
  { label: "leverage", regex: /\bleverag/i },
  { label: "in today's fast-paced", regex: /in today's fast-paced/i },
  { label: "unlock the power", regex: /\bunlock the power\b/i },
  { label: "excited to announce", regex: /excited to announce/i },
  { label: "we're thrilled", regex: /we're thrilled/i },
] as const;

// Fabrication guard: patterns that signal an INVENTED statistic stated as fact.
// The Haiku generator tends to manufacture authoritative-sounding numbers —
// "32% of buyers choose competitors", "a NAHB study found 34% more likely",
// "$1.46M in additional profit". These are unverifiable and forbidden
// (content_pillars.yml do_not_state + channels.yml banned_claims). Kept
// deliberately CONSERVATIVE so real macro stats from the approved citable list
// ("builder confidence was 35 in June 2026 (NAHB)", "~35% of builders cut
// prices") and clearly illustrative examples ("a $350k budget") are NOT blocked.
const SUSPECT_STAT_PATTERNS = [
  { label: "buyer-pct", regex: /\b\d{1,3}\s?%\s+of\s+(?:potential\s+|qualified\s+)?(?:buyers|home\s?buyers|prospects|leads)\b/i },
  { label: "more-likely-pct", regex: /\b\d{1,3}\s?%\s+(?:more|less)\s+likely\b/i },
  { label: "fabricated-study", regex: /\b(?:nahb|industry|recent|a)\s+(?:study|survey|report|benchmark)s?\s+(?:found|shows|showed|says|suggests)\b/i },
  { label: "study-found", regex: /\bstud(?:y|ies)\s+(?:found|show|shows|showed)\b/i },
  { label: "profit-claim", regex: /\$\s?\d[\d,.]*\s*(?:million|billion|k|thousand)?\s+in\s+(?:additional\s+)?(?:profit|revenue|sales)\b/i },
  { label: "roi-seeing", regex: /\bROI\b[^.\n]{0,40}\bbuilders\b[^.\n]{0,20}\bseeing\b/i },
] as const;

export const BANNED_WORDS = BANNED_TERMS.map(({ label }) => label);
export const BANNED = BANNED_TERMS.map(({ regex }) => regex);

export function validate(
  title: string | null | undefined,
  description: string | null | undefined,
  body: string | null | undefined,
): string[] {
  const issues: string[] = [];
  const safeTitle = title ?? "";
  const safeDesc = description ?? "";
  const safeBody = body ?? "";

  for (const re of BANNED) {
    if (re.test(safeBody)) issues.push(`banned:${re.source}`);
    if (re.test(safeTitle)) issues.push(`banned-title:${re.source}`);
    if (re.test(safeDesc)) issues.push(`banned-desc:${re.source}`);
  }

  // Invented / unsourced statistics. Blog-only in effect: seo-draft and
  // seo-publish read every issue, while x-post / fb-post filter to "banned"
  // prefixes, so social posts are unaffected by this gate.
  for (const { label, regex } of SUSPECT_STAT_PATTERNS) {
    if (regex.test(safeBody)) issues.push(`suspect_stat:${label}`);
  }

  if (safeBody.length < BODY_MIN_LENGTH) {
    issues.push(`too_short:${safeBody.length}`);
  }

  const h2 = (safeBody.match(/^##\s+/gm) || []).length;
  if (h2 < 3) issues.push(`structure:h2_${h2}`);

  if (!safeDesc.trim()) {
    issues.push("missing_description");
  } else if (
    safeDesc.length < DESCRIPTION_MIN_LENGTH ||
    safeDesc.length > DESCRIPTION_MAX_LENGTH
  ) {
    issues.push(`description_len:${safeDesc.length}`);
  }

  return issues;
}
