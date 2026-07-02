import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ContentOps compounding feedback loop — SERVER half.
// Design: obsidian-vault/SplanAI/60_ContentOps/feedback-loop-design-20260702.md
//
// Runs daily at 22:25 UTC (07:25 JST, before the 08:00 JST briefing read).
// Aggregates yesterday's-cycle reactions for the CURRENT America/New_York date
// (the same content_date the posting crons used as run_date) and upserts ONE
// row into content_feedback with public_ready=true. A local launchd job then
// anon-reads that row and renders SplanAI/60_ContentOps/feedback/<date>.md
// (scripts/render-content-feedback.mjs) — no secrets ever leave the server.
//
// FAIL-LOUD (never silent-zero): any hard failure below still upserts the row,
// but with status='failed' + source_status + error, and this route returns 500
// so the Vercel cron run is visibly red. Hard failures:
//   - expected X/FB post rows missing for the content date
//   - a "posted" row missing its platform post id
//   - X/FB metrics API non-2xx or metrics missing
//   - no blog article published in the ET-day window
//   - link_events / builder_events query failure
// The next-day /contentops reads the failed row and does NOT optimize on
// missing data.

type SourceStatus = { ok: boolean; error?: string };

type XItem = {
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

type FbItem = {
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

type BlogItem = {
  slug: string;
  title: string;
  target_keyword: string;
  serp_position: number | null;
  organic_clicks_30d: number;
  score: number;
};

type Candidate = {
  channel: "x" | "facebook" | "blog";
  angle: string;
  score: number;
  ref: string;
  failed?: boolean;
  why?: string;
};

function getNewYorkDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// DST-safe UTC instant for an America/New_York wall-clock time.
function etInstant(dateStr: string, hour: number): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hour, 0, 0));
  const tzWall = new Date(guess.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const utcWall = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() + (utcWall.getTime() - tzWall.getTime()));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function head(text: string | null | undefined, n = 80): string {
  return (text ?? "").replace(/\s+/g, " ").slice(0, n);
}

// ── Source: X ────────────────────────────────────────────────────────────────
async function collectX(supabase: SupabaseClient, contentDate: string): Promise<XItem[]> {
  const { data, error } = await supabase
    .from("x_post_draft")
    .select("id, angle, draft_text, status, x_post_id, last_error")
    .eq("platform", "x")
    .eq("run_date", contentDate)
    .in("status", ["posted", "failed"]);

  if (error) throw new Error(`x_post_draft query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`no posted/failed x_post_draft rows for ${contentDate} (expected posts missing)`);
  }

  const items: XItem[] = data.map(r => ({
    draft_id: r.id as string,
    x_post_id: (r.x_post_id as string | null) ?? null,
    angle: (r.angle as string | null) ?? null,
    text_head: head(r.draft_text as string),
    status: r.status as string,
    last_error: (r.last_error as string | null) ?? null,
    metrics: null,
    score: null,
  }));

  const posted = items.filter(i => i.status === "posted");
  const missingId = posted.filter(i => !i.x_post_id);
  if (missingId.length > 0) {
    throw new Error(`posted x rows missing x_post_id: ${missingId.map(i => i.draft_id).join(",")}`);
  }

  if (posted.length > 0) {
    const bearer = process.env.X_API_BEARER_TOKEN;
    if (!bearer) throw new Error("missing env X_API_BEARER_TOKEN");

    // Same metric surface as scripts/x-analytics-sync.ts (public_metrics).
    const ids = posted.map(i => i.x_post_id as string).join(",");
    const url = new URL("https://api.twitter.com/2/tweets");
    url.searchParams.set("ids", ids);
    url.searchParams.set("tweet.fields", "public_metrics");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) {
      throw new Error(`X API ${res.status}: ${head(await res.text(), 300)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          quote_count?: number;
          bookmark_count?: number;
        };
      }>;
      errors?: Array<{ detail?: string; title?: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`X API errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
    }

    for (const item of posted) {
      const m = json.data?.find(t => t.id === item.x_post_id)?.public_metrics;
      if (!m) throw new Error(`X metrics missing for tweet ${item.x_post_id}`);
      item.metrics = {
        impressions: m.impression_count ?? 0,
        likes: m.like_count ?? 0,
        replies: m.reply_count ?? 0,
        reposts: m.retweet_count ?? 0,
        quotes: m.quote_count ?? 0,
        bookmarks: m.bookmark_count ?? 0,
      };
      // Spec scoring: impr + likes*20 + replies*40 + reposts*35
      item.score =
        item.metrics.impressions +
        item.metrics.likes * 20 +
        item.metrics.replies * 40 +
        item.metrics.reposts * 35;
    }
  }

  return items;
}

// ── Source: Facebook ─────────────────────────────────────────────────────────
async function collectFacebook(supabase: SupabaseClient, contentDate: string): Promise<FbItem[]> {
  const { data, error } = await supabase
    .from("fb_post_draft")
    .select("id, message, status, fb_post_id, last_error")
    .eq("run_date", contentDate)
    .in("status", ["posted", "failed"]);

  if (error) throw new Error(`fb_post_draft query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`no posted/failed fb_post_draft rows for ${contentDate} (expected posts missing)`);
  }

  const items: FbItem[] = data.map(r => ({
    draft_id: r.id as string,
    fb_post_id: (r.fb_post_id as string | null) ?? null,
    text_head: head(r.message as string),
    status: r.status as string,
    last_error: (r.last_error as string | null) ?? null,
    metrics: null,
    score: null,
  }));

  const posted = items.filter(i => i.status === "posted");
  const missingId = posted.filter(i => !i.fb_post_id);
  if (missingId.length > 0) {
    throw new Error(`posted fb rows missing fb_post_id: ${missingId.map(i => i.draft_id).join(",")}`);
  }

  if (posted.length > 0) {
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) throw new Error("missing env FB_PAGE_ACCESS_TOKEN");

    for (const item of posted) {
      const url = new URL(`https://graph.facebook.com/v25.0/${item.fb_post_id}/insights`);
      url.searchParams.set(
        "metric",
        "post_impressions,post_engaged_users,post_reactions_by_type_total,post_clicks",
      );
      url.searchParams.set("access_token", token);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`FB insights ${res.status} for ${item.fb_post_id}: ${head(await res.text(), 300)}`);
      }
      const json = (await res.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: unknown }> }>;
      };
      if (!json.data) throw new Error(`FB insights payload missing 'data' for ${item.fb_post_id}`);

      const metric = (name: string): number => {
        const entry = json.data?.find(d => d.name === name);
        if (!entry || !entry.values || entry.values.length === 0) {
          throw new Error(`FB metric '${name}' missing for ${item.fb_post_id}`);
        }
        const v = entry.values[0].value;
        if (typeof v === "number") return v;
        // post_reactions_by_type_total returns an object keyed by reaction type.
        if (v && typeof v === "object") {
          return Object.values(v as Record<string, number>).reduce(
            (a, b) => a + (typeof b === "number" ? b : 0),
            0,
          );
        }
        throw new Error(`FB metric '${name}' has unexpected shape for ${item.fb_post_id}`);
      };

      item.metrics = {
        impressions: metric("post_impressions"),
        engaged_users: metric("post_engaged_users"),
        reactions: metric("post_reactions_by_type_total"),
        clicks: metric("post_clicks"),
      };
      // Spec scoring: impr + engaged*20 + reactions*15 + clicks*30
      item.score =
        item.metrics.impressions +
        item.metrics.engaged_users * 20 +
        item.metrics.reactions * 15 +
        item.metrics.clicks * 30;
    }
  }

  return items;
}

// ── Source: Blog ─────────────────────────────────────────────────────────────
async function collectBlog(
  supabase: SupabaseClient,
  dayStart: Date,
  dayEnd: Date,
): Promise<BlogItem[]> {
  const { data, error } = await supabase
    .from("seo_articles")
    .select("slug, title, target_keyword, serp_position, organic_clicks_30d, published_at")
    .eq("status", "published")
    .gte("published_at", dayStart.toISOString())
    .lt("published_at", dayEnd.toISOString());

  if (error) throw new Error(`seo_articles query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("no blog article published in the ET-day window (seo-publish may have failed)");
  }

  return data.map(a => {
    const serp = (a.serp_position as number | null) ?? null;
    const clicks = (a.organic_clicks_30d as number | null) ?? 0;
    return {
      slug: a.slug as string,
      title: a.title as string,
      target_keyword: a.target_keyword as string,
      serp_position: serp,
      organic_clicks_30d: clicks,
      // Spec scoring: organic_clicks_30d*50 + max(0, 21-serp)*10
      score: clicks * 50 + (serp != null ? Math.max(0, 21 - serp) * 10 : 0),
    };
  });
}

// ── Source: Portal (link_events) ─────────────────────────────────────────────
async function collectPortal(supabase: SupabaseClient, dayStart: Date, dayEnd: Date) {
  const { data, error } = await supabase
    .from("link_events")
    .select("event_type, link_id")
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString());

  if (error) throw new Error(`link_events query failed: ${error.message}`);

  const rows = data ?? [];
  const byType: Record<string, number> = {};
  const uniqueLinks = new Set<string>();
  for (const r of rows) {
    byType[r.event_type as string] = (byType[r.event_type as string] ?? 0) + 1;
    uniqueLinks.add(r.link_id as string);
  }
  return {
    total_events: rows.length,
    unique_links: uniqueLinks.size,
    by_type: byType,
  };
}

// ── Source: Builder (builder_events) ─────────────────────────────────────────
async function collectBuilder(supabase: SupabaseClient, dayStart: Date, dayEnd: Date) {
  const { data, error } = await supabase
    .from("builder_events")
    .select("event_type")
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString());

  if (error) throw new Error(`builder_events query failed: ${error.message}`);

  const byType: Record<string, number> = {};
  for (const r of data ?? []) {
    byType[r.event_type as string] = (byType[r.event_type as string] ?? 0) + 1;
  }
  return { total_events: (data ?? []).length, by_type: byType };
}

// ── Winner/loser extraction + deterministic Japanese next-angle ──────────────
function pickWinnersLosers(x: XItem[], fb: FbItem[], blog: BlogItem[]) {
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

  // winner = highest score WITH distribution (all-zero day has no winner).
  const winners =
    scored.length > 0 && scored.some(c => c.score > 0)
      ? [scored.reduce((a, b) => (b.score > a.score ? b : a))]
      : [];
  // losers = failed posts first; otherwise the lowest scorer (only meaningful
  // when there is a distribution to compare against).
  const losers =
    failed.length > 0
      ? failed
      : scored.length > 1 && winners.length > 0
        ? [scored.reduce((a, b) => (b.score < a.score ? b : a))]
        : [];

  let next_angle_ja: string;
  if (winners.length > 0) {
    const w = winners[0];
    const l = losers[0];
    next_angle_ja =
      l && !l.failed
        ? `「${l.angle}」より「${w.angle}」の反応が強い（${w.channel} score ${w.score}）。明日は「${w.angle}」起点で作る。`
        : `「${w.angle}」が最も反応（${w.channel} score ${w.score}）。明日も「${w.angle}」の別切り口を先頭に。`;
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

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Cannot even record the failure row — surface loudly.
    return NextResponse.json(
      { ok: false, error: "missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const contentDate = getNewYorkDate();
  const dayStart = etInstant(contentDate, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const sourceStatus: Record<string, SourceStatus> = {};
  const errors: string[] = [];

  async function run<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const value = await fn();
      sourceStatus[name] = { ok: true };
      return value;
    } catch (e) {
      const msg = toErrorMessage(e);
      sourceStatus[name] = { ok: false, error: msg };
      errors.push(`${name}: ${msg}`);
      return null;
    }
  }

  const [x, facebook, blog, portal, builder] = await Promise.all([
    run("x", () => collectX(supabase, contentDate)),
    run("facebook", () => collectFacebook(supabase, contentDate)),
    run("blog", () => collectBlog(supabase, dayStart, dayEnd)),
    run("portal", () => collectPortal(supabase, dayStart, dayEnd)),
    run("builder", () => collectBuilder(supabase, dayStart, dayEnd)),
  ]);

  const failed = errors.length > 0;
  const { winners, losers, next_angle_ja } = pickWinnersLosers(x ?? [], facebook ?? [], blog ?? []);

  const row = {
    content_date: contentDate,
    status: failed ? "failed" : "complete",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_status: sourceStatus,
    x,
    facebook,
    blog,
    portal,
    builder,
    winners,
    losers,
    // On a failed day the render/next-day loop must see the failure, not a
    // half-optimized angle (silent-zero ban).
    next_angle_ja: failed
      ? `集計失敗（${errors.length}ソース）。このデータで角度最適化しない。詳細: ${head(errors.join(" | "), 200)}`
      : next_angle_ja,
    error: failed ? errors.join(" | ") : null,
    // failed rows are ALSO public_ready: the local renderer must be able to
    // surface the failure in the vault (fail-loud, never invisible).
    public_ready: true,
  };

  const { error: upsertError } = await supabase
    .from("content_feedback")
    .upsert(row, { onConflict: "content_date" });

  if (upsertError) {
    console.error("[content-feedback] upsert failed:", upsertError.message);
    return NextResponse.json(
      { ok: false, content_date: contentDate, error: `upsert failed: ${upsertError.message}`, source_status: sourceStatus },
      { status: 500 },
    );
  }

  if (failed) {
    console.error("[content-feedback] recorded FAILED row:", errors.join(" | "));
    return NextResponse.json(
      { ok: false, content_date: contentDate, status: "failed", source_status: sourceStatus, error: errors.join(" | ") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    content_date: contentDate,
    status: "complete",
    winners,
    next_angle_ja,
  });
}
