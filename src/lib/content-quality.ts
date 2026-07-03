// src/lib/content-quality.ts
// Single source of truth for blog content quality rules. Used by BOTH the
// generator (seo-draft) and the publish gate (seo-publish) so they can never
// drift. Intentionally EXCLUDES "seamless" / "disrupt" — normal home-building
// vocabulary (seamless gutters, market disruption) that would wrongly skip
// good drafts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PULSE_METRO_SLUGS } from "@/data/pulse-metros";
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
  { label: "profit-claim", regex: /\$\s?\d[\d,.]*\s*(?:million|billion|thousand|[kmb])?\s+in\s+(?:additional\s+)?(?:profit|revenue|sales)\b/i },
  { label: "roi-seeing", regex: /\bROI\b[^.\n]{0,40}\bbuilders\b[^.\n]{0,20}\bseeing\b/i },
  // ── Customer-outcome fabrications actually posted to X (audit 2026-07-02) ──
  // "One builder went from 3 to 12 concepts per week"
  { label: "from-x-to-y", regex: /\bfrom\s+\d[\d,.]*\s*(?:hours?|hrs?|h|days?|weeks?|minutes?|mins?|concepts?|leads?|deals?|proposals?|clients?|%)?\s*(?:\/\s*\w+|per\s+\w+)?\s+(?:down\s+)?to\s+(?:just\s+)?\d/i },
  // "40h→4h", "40 hours -> 4 hours"
  { label: "arrow-metric", regex: /\d[\d,.]*\s*(?:hours?|hrs?|h|%|x|days?|min(?:ute)?s?|weeks?)?\s*(?:→|->|⇒)\s*\d/i },
  // "SplanAI cut that to 4 hours", "cuts it down to 30 minutes"
  { label: "cut-to", regex: /\bcuts?\s+(?:that|it|this|them)\s*(?:down\s+)?to\s+(?:just\s+)?\d/i },
  // "35% faster", "40% more deals"
  { label: "pct-outcome", regex: /\b\d{1,3}\s?%\s+(?:faster|slower|more|fewer|less|higher|lower|better)\b/i },
  // "3x more deals", "10x faster"
  { label: "x-times-outcome", regex: /\b\d+(?:\.\d+)?\s?x\s+(?:more|faster|higher|better|fewer)\b/i },
  // "One builder / a customer / our client ... <number>" — anecdotal customer result
  { label: "customer-outcome", regex: /\b(?:one|a|our|another)\s+(?:builders?|customers?|users?|clients?)\s+[^.!?\n]{0,80}\d/i },
] as const;

// Unverified-launch claims ("Just shipped: instant cost estimation overlay").
// NEVER excusable by a source marker or allowlist — a real launch is announced
// by a human, not by the Haiku generator.
const SHIPPED_CLAIM_PATTERNS = [
  { label: "just-shipped", regex: /\bjust\s+(?:shipped|launched|released|rolled\s+out|went\s+live)\b/i },
  { label: "we-shipped", regex: /\b(?:we|i)\s+(?:shipped|launched|released|rolled\s+out)\b/i },
  { label: "now-live", regex: /\b(?:now\s+live|is\s+live\s+now|new\s+feature\s*:)\b/i },
] as const;

// A statistic is allowed when its sentence carries an explicit approved-source
// parenthetical, e.g. "(NAHB, June 2026)" — matches the citable list used by
// the seo-draft prompt.
const SOURCE_MARKER =
  /\((?:source:\s*)?(?:NAHB|NAR|U\.?S\.?\s?Census(?:\s?Bureau)?|Census\s?Bureau|Freddie\s?Mac|Fannie\s?Mae|Bureau\s+of\s+Labor\s+Statistics|BLS|HUD|Federal\s+Reserve)[^)]*\)/i;

export const BANNED_WORDS = BANNED_TERMS.map(({ label }) => label);
export const BANNED = BANNED_TERMS.map(({ regex }) => regex);

export type SuspectStatOptions = {
  // Extra caller-approved snippets (e.g. citable_stats entries). A sentence
  // containing/matching an allowlist entry is exempt from the STAT patterns
  // (but never from the SHIPPED patterns).
  allowlist?: ReadonlyArray<string | RegExp>;
};

// Fail-loud fabrication gate for ANY outbound copy (X / FB / blog).
// Returns [] when clean, otherwise "suspect_stat:<label>" / "unverified_claim:<label>"
// issues. Sentence-scoped so one sourced macro stat doesn't excuse the rest of
// the text, and one fabricated line is caught even in a long clean article.
export function suspectStat(
  text: string | null | undefined,
  options?: SuspectStatOptions,
): string[] {
  const safeText = text ?? "";
  if (!safeText.trim()) return [];

  const allowlist = options?.allowlist ?? [];
  const issues = new Set<string>();
  // Rough sentence split: terminal punctuation or newlines.
  const sentences = safeText.split(/(?<=[.!?])\s+|\n+/);

  for (const sentence of sentences) {
    // Launch claims are never excusable.
    for (const { label, regex } of SHIPPED_CLAIM_PATTERNS) {
      if (regex.test(sentence)) issues.add(`unverified_claim:${label}`);
    }

    const sourced =
      SOURCE_MARKER.test(sentence) ||
      allowlist.some(entry =>
        typeof entry === "string" ? sentence.includes(entry) : entry.test(sentence),
      );
    if (sourced) continue;

    for (const { label, regex } of SUSPECT_STAT_PATTERNS) {
      if (regex.test(sentence)) issues.add(`suspect_stat:${label}`);
    }
  }

  return [...issues];
}

// ── Link integrity gate (W1 2026-07-03) ─────────────────────────────────────
// Root incident: 2026-07-02, an X auto-post linked
// /blog/small-builder-look-like-a-national-one while the article was still
// seo_articles.status='draft' — the post shipped before the page existed.
// checkLinkIntegrity() is called by x-post / fb-post in the same layer as
// suspectStat(): a draft whose splanai.com link does not resolve to a live
// public page is SKIPPED (stays status=draft, retried next cycle) and surfaces
// as a heartbeat WARN. Fail-closed: a DB error blocks the post rather than
// risking a dead link on the timeline.
//
// Route knowledge mirrors src/app + src/app/robots.ts (PRIVATE_PATHS) and the
// audit script scripts/link-integrity-sweep.mjs. Keep the three in sync.

// HAND-CURATED allowlist of public marketing routes we are willing to point
// outbound social copy at — deliberately NOT derived from robots.ts or the
// sitemap (codex review: robots "*" allows far more than we should ever post,
// e.g. /login /reset-password; a mechanical list would silently widen).
// robots-PRIVATE routes (/dashboard /results /s/ /api/ /invite /try) and auth /
// app-internal utility pages (/login /forgot-password /reset-password
// /generate /upgrade) are intentionally absent: a post linking those is a bug.
// Extending this list is an explicit editorial decision — add the route here
// AND to the mirror in scripts/link-integrity-sweep.mjs.
export const POSTABLE_STATIC_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/blog",
  "/pulse",
  "/tools",
  "/tools/payment-calculator",
  "/tools/lot-feasibility",
  "/terms",
  "/privacy",
]);

// Full URLs plus bare "splanai.com/..." mentions (X copy often drops https://).
const SPLANAI_URL_RE =
  /\bhttps?:\/\/[^\s<>"'()\][]+|(?<![\w/.@])(?:www\.)?splanai\.com\/[^\s<>"'()\][]*/gi;

// Normalized splanai.com paths referenced by the given texts (dedup'd).
// Non-splanai hosts are ignored — this gate owns only our own links.
export function extractSplanaiPaths(
  ...texts: Array<string | null | undefined>
): string[] {
  const paths = new Set<string>();
  for (const text of texts) {
    for (const raw of (text ?? "").match(SPLANAI_URL_RE) ?? []) {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      let url: URL;
      try {
        url = new URL(withProto);
      } catch {
        continue;
      }
      if (!/^(www\.)?splanai\.com$/i.test(url.hostname)) continue;
      // Trailing prose punctuation ("…read more: splanai.com/blog/x.") and
      // trailing slashes are not part of the route.
      let path = url.pathname.replace(/[.,!?;:…]+$/, "");
      if (path.length > 1) path = path.replace(/\/+$/, "");
      paths.add(path || "/");
    }
  }
  return [...paths];
}

// Minimal structural slice of SupabaseClient used by the gate — lets tests
// inject a fake without a network round-trip. Call sites pass a real
// SupabaseClient; the signature also names it explicitly because checking the
// full PostgrestFilterBuilder chain against this slice trips TS2589
// ("excessively deep") — the union keeps the real-client path a trivial check.
export type LinkIntegrityDb = {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): PromiseLike<{
        data: Array<{ slug: string; status: string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

// Fail-loud link gate for outbound X / FB copy. Returns [] when every
// splanai.com URL in text/linkUrl resolves to a live public page, otherwise:
//   link_integrity:blog_unpublished:<slug>  article exists but status!=published
//   link_integrity:blog_missing:<slug>      no seo_articles row for the slug
//   link_integrity:unknown_path:<path>      not a postable route (incl. robots-PRIVATE)
//   link_integrity:check_failed:<msg>       DB error — fail closed, never post blind
export async function checkLinkIntegrity(
  text: string | null | undefined,
  linkUrl: string | null | undefined,
  db: LinkIntegrityDb | SupabaseClient,
): Promise<string[]> {
  const issues: string[] = [];
  const blogSlugs: string[] = [];

  for (const path of extractSplanaiPaths(text, linkUrl)) {
    if (POSTABLE_STATIC_ROUTES.has(path)) continue;

    const pulse = path.match(/^\/pulse\/([^/]+)$/);
    if (pulse) {
      if (!PULSE_METRO_SLUGS.includes(pulse[1])) {
        issues.push(`link_integrity:unknown_path:${path}`);
      }
      continue;
    }

    const blog = path.match(/^\/blog\/([^/]+)$/);
    if (blog) {
      blogSlugs.push(blog[1]);
      continue;
    }

    issues.push(`link_integrity:unknown_path:${path}`);
  }

  if (blogSlugs.length > 0) {
    const { data, error } = await (db as LinkIntegrityDb)
      .from("seo_articles")
      .select("slug, status")
      .in("slug", blogSlugs);

    if (error) {
      issues.push(`link_integrity:check_failed:${error.message}`);
    } else {
      const statusBySlug = new Map((data ?? []).map(r => [r.slug, r.status]));
      for (const slug of blogSlugs) {
        const status = statusBySlug.get(slug);
        if (status === undefined) issues.push(`link_integrity:blog_missing:${slug}`);
        else if (status !== "published") issues.push(`link_integrity:blog_unpublished:${slug}`);
      }
    }
  }

  return issues;
}

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

  // Invented / unsourced statistics and unverified launch claims. Applied to
  // every channel: seo-draft / seo-publish read every issue, and x-post /
  // fb-post also call suspectStat() directly on the post text.
  issues.push(...suspectStat(safeBody));

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
