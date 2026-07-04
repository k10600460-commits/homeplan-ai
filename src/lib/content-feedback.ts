/**
 * content-feedback.ts — pure logic for the ContentOps compounding feedback loop.
 *
 * Extracted from src/app/api/cron/content-feedback/route.ts so the classification
 * (three-way source outcome → status), the link_events (portal) aggregation, and
 * the winner/loser + next-angle derivation are unit-testable without Next.js,
 * network, or Supabase. The route keeps only the async Supabase/HTTP I/O and
 * delegates every decision here.
 *
 * Design: obsidian-vault/SplanAI/60_ContentOps/feedback-loop-design-20260702.md
 *
 * Reaction-collection main axis = link_events (free, first-party). X/FB analytics
 * need paid API env that is not injected yet (課金判断待ち), so those sources are
 * marked "unavailable" (a declared gap, fail-loud) rather than hard-failing the
 * whole day. A day with only the free portal signal is status='partial', not
 * 'failed' — the loop still closes.
 */

// ── Source outcome ─────────────────────────────────────────────────────────────
// Thrown by a collector when the source cannot be read for a *known, declared*
// reason (missing analytics env, no posts to measure, API auth/tier gate). This
// is NOT a hard failure: the row is kept as status='partial' and the reason is
// recorded (never silent-zero). Any *other* thrown Error is a hard failure
// (real bug / core free-source breakage) → status='failed'.
export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

export type SourceStatus = {
  ok: boolean;
  unavailable?: true; // true = declared gap (env待ち/課金判断待ち), not a failure
  reason?: string; // why unavailable
  error?: string; // hard-failure message
};

/**
 * status decision:
 *   any hard error            → 'failed'  (route returns 500, render exit 2)
 *   else any unavailable source → 'partial' (route returns 200, render exit 0)
 *   else                       → 'complete'
 * The free core sources (link_events / builder_events) throw plain Errors on
 * query failure, so a broken core signal correctly yields 'failed'.
 */
export function decideStatus(
  hardErrorCount: number,
  unavailableCount: number,
): "complete" | "partial" | "failed" {
  if (hardErrorCount > 0) return "failed";
  if (unavailableCount > 0) return "partial";
  return "complete";
}

// ── Shared item shapes (server fills these from Supabase) ──────────────────────
export type XItem = {
  draft_id: string;
  x_post_id: string | null;
  angle: string | null;
  text_head: string;
  status: string;
  last_error: string | null;
  metrics: {
    impressions: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    bookmarks: number;
  } | null;
  score: number | null;
};

export type FbItem = {
  draft_id: string;
  fb_post_id: string | null;
  text_head: string;
  status: string;
  last_error: string | null;
  metrics: {
    impressions: number;
    engaged_users: number;
    reactions: number;
    clicks: number;
  } | null;
  score: number | null;
};

export type BlogItem = {
  slug: string;
  title: string;
  target_keyword: string;
  serp_position: number | null;
  organic_clicks_30d: number;
  score: number;
};

export type Candidate = {
  channel: "x" | "facebook" | "blog" | "portal";
  angle: string;
  score: number;
  ref: string;
  failed?: boolean;
  why?: string;
};

export function head(text: string | null | undefined, n = 80): string {
  return (text ?? "").replace(/\s+/g, " ").slice(0, n);
}

// ── Portal (link_events) aggregation — the free compounding signal ─────────────
export type LinkEventRow = { event_type: string; link_id: string };
// slug ONLY — never buyer PII (client_name). slug is a random short URL key that
// is already public in the share URL (homeplan-ai.vercel.app/s/{slug}); the
// content_feedback row is anon-readable (public_ready) and rendered into the
// public vault, so no recipient name must ever land here.
export type LinkMeta = { slug: string };

export type PortalLinkAgg = {
  link_id: string;
  slug: string;
  events: number;
  by_type: Record<string, number>;
  score: number;
};

export type PortalAgg = {
  total_events: number;
  unique_links: number;
  by_type: Record<string, number>;
  top_links: PortalLinkAgg[];
};

// Intent-weighted so "which shared portal resonated" reflects depth of interest,
// not just raw page loads. Deterministic counting — no ML, no fabricated stats.
export const PORTAL_EVENT_WEIGHTS: Record<string, number> = {
  view: 1,
  return_visit: 3,
  plan_selected: 5,
  pdf_download: 8,
  prequal_click: 12,
};

export function portalEventWeight(eventType: string): number {
  return PORTAL_EVENT_WEIGHTS[eventType] ?? 1;
}

export function aggregatePortal(
  rows: LinkEventRow[],
  meta: Map<string, LinkMeta> = new Map(),
): PortalAgg {
  const byType: Record<string, number> = {};
  const perLink = new Map<string, PortalLinkAgg>();

  for (const r of rows) {
    byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
    const m = meta.get(r.link_id);
    const slug = m?.slug ?? r.link_id;
    let agg = perLink.get(r.link_id);
    if (!agg) {
      agg = { link_id: r.link_id, slug, events: 0, by_type: {}, score: 0 };
      perLink.set(r.link_id, agg);
    }
    agg.events += 1;
    agg.by_type[r.event_type] = (agg.by_type[r.event_type] ?? 0) + 1;
    agg.score += portalEventWeight(r.event_type);
  }

  const top_links = [...perLink.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  return {
    total_events: rows.length,
    unique_links: perLink.size,
    by_type: byType,
    top_links,
  };
}

function typeBreakdown(byType: Record<string, number>): string {
  return Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}×${n}`)
    .join(", ");
}

// Winner from the portal signal: the highest-scoring shared portal WITH real
// engagement (score>0). Null on an empty/zero day (no distribution → no winner).
export function portalWinnerCandidate(agg: PortalAgg): Candidate | null {
  const top = agg.top_links[0];
  if (!top || top.score <= 0) return null;
  return {
    channel: "portal",
    angle: `portal:${top.slug}`,
    score: top.score,
    ref: top.slug,
    why: `${top.events} events (${typeBreakdown(top.by_type)})`,
  };
}

// ── Winner/loser extraction + deterministic Japanese next-angle ────────────────
// Content channels (x/fb/blog) share the design's additive score family and are
// compared among themselves. The portal winner is a *different* signal type
// (first-party buyer engagement) and is surfaced as its own winners entry rather
// than force-ranked against incomparable X/FB/blog scores.
export function pickWinnersLosers(
  x: XItem[],
  fb: FbItem[],
  blog: BlogItem[],
  portalWinner: Candidate | null = null,
): { winners: Candidate[]; losers: Candidate[]; next_angle_ja: string } {
  const candidates: Candidate[] = [];

  for (const i of x) {
    if (i.status === "failed") {
      candidates.push({
        channel: "x", angle: i.angle ?? "unknown", score: -1,
        ref: i.draft_id, failed: true, why: i.last_error ?? "post failed",
      });
    } else if (i.score != null) {
      candidates.push({ channel: "x", angle: i.angle ?? "unknown", score: i.score, ref: i.x_post_id ?? i.draft_id });
    }
  }
  for (const i of fb) {
    if (i.status === "failed") {
      candidates.push({
        channel: "facebook", angle: "facebook_daily", score: -1,
        ref: i.draft_id, failed: true, why: i.last_error ?? "post failed",
      });
    } else if (i.score != null) {
      candidates.push({ channel: "facebook", angle: "facebook_daily", score: i.score, ref: i.fb_post_id ?? i.draft_id });
    }
  }
  for (const b of blog) {
    candidates.push({ channel: "blog", angle: b.target_keyword, score: b.score, ref: b.slug });
  }

  const scored = candidates.filter(c => !c.failed);
  const failed = candidates.filter(c => c.failed);

  // Best content-channel angle WITH distribution (all-zero → no content winner).
  const contentWinner =
    scored.length > 0 && scored.some(c => c.score > 0)
      ? scored.reduce((a, b) => (b.score > a.score ? b : a))
      : null;

  // winners = content winner (if any) + portal winner (if any), both surfaced.
  const winners: Candidate[] = [];
  if (contentWinner) winners.push(contentWinner);
  if (portalWinner) winners.push(portalWinner);

  // losers = failed posts first; else the lowest content scorer when there is a
  // distribution to compare against.
  const losers =
    failed.length > 0
      ? failed
      : scored.length > 1 && contentWinner
        ? [scored.reduce((a, b) => (b.score < a.score ? b : a))]
        : [];

  let next_angle_ja: string;
  if (contentWinner) {
    const w = contentWinner;
    const l = losers[0];
    next_angle_ja =
      l && !l.failed
        ? `「${l.angle}」より「${w.angle}」の反応が強い（${w.channel} score ${w.score}）。明日は「${w.angle}」起点で作る。`
        : `「${w.angle}」が最も反応（${w.channel} score ${w.score}）。明日も「${w.angle}」の別切り口を先頭に。`;
    if (portalWinner) {
      next_angle_ja += ` 共有ポータル「${portalWinner.ref}」も反応（${portalWinner.why}）— この提案系統も継続。`;
    }
    if (failed.length > 0) {
      next_angle_ja += ` 失敗投稿${failed.length}件あり（原因: ${head(failed[0].why, 60)}）— 修正が先。`;
    }
  } else if (portalWinner) {
    next_angle_ja =
      `共有ポータル「${portalWinner.ref}」が最も反応（${portalWinner.why}）。X/FB分析はenv未投入で欠測だが、` +
      `この提案系統（プラン/価格の見せ方）が響いている。明日はこの切り口を先頭に。`;
    if (failed.length > 0) {
      next_angle_ja += ` 失敗投稿${failed.length}件あり（原因: ${head(failed[0].why, 60)}）— 修正が先。`;
    }
  } else if (failed.length > 0) {
    next_angle_ja = `投稿失敗が発生（${failed.map(f => f.channel).join("/")}）。角度最適化より配信復旧が先。原因: ${head(failed[0].why, 80)}`;
  } else {
    next_angle_ja =
      "全チャネルで反応スコア0（分布なし）。勝ち角度は判定できない — 明日は pillar ローテーションを維持し、角度を変えない。";
  }

  return { winners, losers, next_angle_ja };
}
