import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordHeartbeat, recordHeartbeatFromResponse } from "@/lib/heartbeat";
import {
  SourceUnavailableError,
  aggregatePortal,
  decideStatus,
  head,
  pickWinnersLosers,
  portalWinnerCandidate,
  type BlogItem,
  type FbItem,
  type LinkEventRow,
  type LinkMeta,
  type PortalAgg,
  type SourceStatus,
  type XItem,
} from "@/lib/content-feedback";

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
// REACTION-COLLECTION MAIN AXIS = link_events (portal opens/clicks) — free,
// first-party, already alive. X/FB analytics need paid API env that is NOT
// injected yet (課金判断待ち), so those sources are marked "unavailable" (a
// declared gap, recorded with a reason) rather than failing the whole day.
//
// STATUS (fail-loud, never silent-zero):
//   complete — every source read cleanly.
//   partial  — the free core (link_events/builder) read, but ≥1 of X/FB/blog is
//              unavailable (env待ち/課金判断待ち/no posts). The loop STILL closes
//              on the free signal; the gaps are visible in source_status.
//   failed   — a free core source (link_events/builder) query broke, or the
//              upsert failed. Route returns 500 so the cron run is visibly red
//              and the next-day /contentops does NOT optimize on broken data.

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

// ── Source: X (secondary, best-effort) ─────────────────────────────────────────
// Every failure here is SourceUnavailableError: X analytics is a paid, env-gated
// secondary signal. It must NEVER take down the free portal loop — it is recorded
// as a declared gap (partial), not a hard failure.
async function collectX(supabase: SupabaseClient, contentDate: string): Promise<XItem[]> {
  const { data, error } = await supabase
    .from("x_post_draft")
    .select("id, angle, draft_text, status, x_post_id, last_error")
    .eq("platform", "x")
    .eq("run_date", contentDate)
    .in("status", ["posted", "failed"]);

  if (error) throw new SourceUnavailableError(`x_post_draft query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new SourceUnavailableError(`no posted/failed x_post_draft rows for ${contentDate}（X未産出 or 投稿env待ち）`);
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
    throw new SourceUnavailableError(`posted x rows missing x_post_id: ${missingId.map(i => i.draft_id).join(",")}（投稿pipeline要確認）`);
  }

  if (posted.length > 0) {
    const bearer = process.env.X_API_BEARER_TOKEN;
    if (!bearer) {
      throw new SourceUnavailableError("env未投入 X_API_BEARER_TOKEN（X分析読取は課金判断待ち・link_eventsで代替中）");
    }

    // Same metric surface as scripts/x-analytics-sync.ts (public_metrics).
    const ids = posted.map(i => i.x_post_id as string).join(",");
    const url = new URL("https://api.twitter.com/2/tweets");
    url.searchParams.set("ids", ids);
    url.searchParams.set("tweet.fields", "public_metrics");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) {
      throw new SourceUnavailableError(`X API ${res.status}: ${head(await res.text(), 200)}（無料枠/課金ゲートの可能性）`);
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
      throw new SourceUnavailableError(`X API errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
    }

    for (const item of posted) {
      const m = json.data?.find(t => t.id === item.x_post_id)?.public_metrics;
      if (!m) throw new SourceUnavailableError(`X metrics missing for tweet ${item.x_post_id}`);
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

// ── Source: Facebook (secondary, best-effort) ──────────────────────────────────
async function collectFacebook(supabase: SupabaseClient, contentDate: string): Promise<FbItem[]> {
  const { data, error } = await supabase
    .from("fb_post_draft")
    .select("id, message, status, fb_post_id, last_error")
    .eq("run_date", contentDate)
    .in("status", ["posted", "failed"]);

  if (error) throw new SourceUnavailableError(`fb_post_draft query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new SourceUnavailableError(`no posted/failed fb_post_draft rows for ${contentDate}（FB未産出 or 投稿env待ち）`);
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
    throw new SourceUnavailableError(`posted fb rows missing fb_post_id: ${missingId.map(i => i.draft_id).join(",")}（投稿pipeline要確認）`);
  }

  if (posted.length > 0) {
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) {
      throw new SourceUnavailableError("env未投入 FB_PAGE_ACCESS_TOKEN（FB分析読取は課金判断待ち・link_eventsで代替中）");
    }

    for (const item of posted) {
      const url = new URL(`https://graph.facebook.com/v25.0/${item.fb_post_id}/insights`);
      url.searchParams.set(
        "metric",
        "post_impressions,post_engaged_users,post_reactions_by_type_total,post_clicks",
      );
      url.searchParams.set("access_token", token);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new SourceUnavailableError(`FB insights ${res.status} for ${item.fb_post_id}: ${head(await res.text(), 200)}`);
      }
      const json = (await res.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: unknown }> }>;
      };
      if (!json.data) throw new SourceUnavailableError(`FB insights payload missing 'data' for ${item.fb_post_id}`);

      const metric = (name: string): number => {
        const entry = json.data?.find(d => d.name === name);
        if (!entry || !entry.values || entry.values.length === 0) {
          throw new SourceUnavailableError(`FB metric '${name}' missing for ${item.fb_post_id}`);
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
        throw new SourceUnavailableError(`FB metric '${name}' has unexpected shape for ${item.fb_post_id}`);
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

// ── Source: Blog (secondary, best-effort) ──────────────────────────────────────
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

  if (error) throw new SourceUnavailableError(`seo_articles query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new SourceUnavailableError("no blog article published in the ET-day window（当日publish無し）");
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

// ── Source: Portal / link_events (FREE CORE — the compounding main axis) ────────
// A query failure here is a HARD failure (plain Error → status='failed'): this is
// the free first-party signal the whole loop now rests on. The shared_links slug
// lookup is best-effort (a slug-join hiccup must not lose the free signal).
async function collectPortal(
  supabase: SupabaseClient,
  dayStart: Date,
  dayEnd: Date,
): Promise<PortalAgg> {
  const { data, error } = await supabase
    .from("link_events")
    .select("event_type, link_id")
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString());

  if (error) throw new Error(`link_events query failed: ${error.message}`);

  const rows = (data ?? []) as LinkEventRow[];

  // Resolve link_id → shared_links.slug so the feedback names WHICH portal
  // resonated (not an opaque uuid). slug ONLY — never client_name: this row is
  // public_ready (anon-readable) and rendered into the public vault, so buyer PII
  // must not be pulled in. Best-effort: on lookup failure fall back to link_id.
  const meta = new Map<string, LinkMeta>();
  const ids = [...new Set(rows.map(r => r.link_id))];
  if (ids.length > 0) {
    const { data: links } = await supabase
      .from("shared_links")
      .select("id, slug")
      .in("id", ids);
    for (const l of links ?? []) {
      meta.set(l.id as string, { slug: (l.slug as string) ?? (l.id as string) });
    }
  }

  return aggregatePortal(rows, meta);
}

// ── Source: Builder / builder_events (FREE CORE) ───────────────────────────────
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

// ── Handler ──────────────────────────────────────────────────────────────────
async function contentFeedbackHandler(req: NextRequest) {
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
  const hardErrors: string[] = []; // free-core breakage → 'failed'
  const unavailable: string[] = []; // declared gaps (env待ち/課金判断待ち) → 'partial'

  async function run<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const value = await fn();
      sourceStatus[name] = { ok: true };
      return value;
    } catch (e) {
      const msg = toErrorMessage(e);
      if (e instanceof SourceUnavailableError) {
        sourceStatus[name] = { ok: false, unavailable: true, reason: msg };
        unavailable.push(`${name}: ${msg}`);
      } else {
        sourceStatus[name] = { ok: false, error: msg };
        hardErrors.push(`${name}: ${msg}`);
      }
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

  const status = decideStatus(hardErrors.length, unavailable.length);
  const portalWinner = portal ? portalWinnerCandidate(portal) : null;
  const { winners, losers, next_angle_ja } = pickWinnersLosers(
    x ?? [],
    facebook ?? [],
    blog ?? [],
    portalWinner,
  );

  const row = {
    content_date: contentDate,
    status,
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
    // On a HARD-failed day the render/next-day loop must see the failure, not a
    // half-optimized angle (silent-zero ban). Partial days keep the real angle
    // (free portal signal is trustworthy); the gaps live in source_status.
    next_angle_ja:
      status === "failed"
        ? `集計失敗（コア無料ソース ${hardErrors.length}件）。このデータで角度最適化しない。詳細: ${head(hardErrors.join(" | "), 200)}`
        : next_angle_ja,
    // error column = HARD failure only. Unavailable (env待ち) reasons live in
    // source_status so partial days are green but the gaps stay visible.
    error: hardErrors.length > 0 ? hardErrors.join(" | ") : null,
    // partial/failed rows are ALSO public_ready: the local renderer must surface
    // the status + gaps in the vault (fail-loud, never invisible).
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

  if (status === "failed") {
    console.error("[content-feedback] recorded FAILED row (core source broke):", hardErrors.join(" | "));
    return NextResponse.json(
      { ok: false, content_date: contentDate, status, source_status: sourceStatus, error: hardErrors.join(" | ") },
      { status: 500 },
    );
  }

  // complete or partial → 200 (cron green). Partial still records the declared
  // gaps so they are visible in the cron log (not silent-zero).
  if (status === "partial") {
    console.warn("[content-feedback] recorded PARTIAL row (declared gaps):", unavailable.join(" | "));
  }
  return NextResponse.json({
    ok: true,
    content_date: contentDate,
    status,
    winners,
    next_angle_ja,
    ...(unavailable.length > 0 ? { unavailable } : {}),
  });
}

// R5 cron heartbeat — thin wrapper only; the handler above is unchanged.
// 2xx (complete/partial) → last_ok, 5xx/throw (failed) → last_error.
export async function GET(req: NextRequest) {
  try {
    const res = await contentFeedbackHandler(req);
    await recordHeartbeatFromResponse("content-feedback", res);
    return res;
  } catch (err) {
    await recordHeartbeat("content-feedback", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
