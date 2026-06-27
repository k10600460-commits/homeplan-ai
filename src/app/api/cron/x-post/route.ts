import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validate as validateContentQuality } from "@/lib/content-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel cron is UTC-only. X timing matters, so this route re-gates on
// America/New_York before selecting a draft or posting.
const POST_CAP_PER_DAY = 2;
const URL_BODY_CAP_PER_DAY = 1;
const DEFAULT_ET_HOURS = "9,14";
const URL_RE = /\bhttps?:\/\/\S+/i;

type XPostDraft = {
  id: string;
  run_date: string;
  angle: string | null;
  draft_text: string;
  link_url: string | null;
  created_at: string;
  post_attempts: number | null;
};

type XOAuthToken = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TweetResponse = {
  data?: { id: string; text: string };
  errors?: unknown;
};

function getNewYorkClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

function allowedHours(): number[] {
  const parsed = (process.env.X_POST_HOURS_ET ?? DEFAULT_ET_HOURS)
    .split(",")
    .map(h => Number(h.trim()))
    .filter(Number.isInteger);

  return parsed.length > 0 ? parsed : [9, 14];
}

function hasUrl(text: string): boolean {
  return URL_RE.test(text);
}

function xUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bannedIssuesForX(text: string): string[] {
  // validate() is blog-oriented. For X, reuse it as the banned-term source
  // and ignore blog-only length / description / structure issues.
  return validateContentQuality(
    "X post",
    "Plain SplanAI social post for home builders, checked only for banned terms.",
    text,
  ).filter(issue => issue.startsWith("banned"));
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
    throw new Error("Missing X_CLIENT_ID or X_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.X_CLIENT_ID,
  });

  const basic = Buffer
    .from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`)
    .toString("base64");

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    throw new Error(`X token refresh failed ${res.status}: ${JSON.stringify(json)}`);
  }

  if (!json.access_token || !json.refresh_token) {
    throw new Error("X token refresh did not return access_token and refresh_token");
  }

  return json;
}

async function getFreshAccessToken(
  supabase: SupabaseClient,
  token: XOAuthToken,
): Promise<{ accessToken: string; refreshed: boolean }> {
  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0;
  const stillFresh = token.access_token && expiresAt - Date.now() > 120_000;

  if (stillFresh) {
    return { accessToken: token.access_token!, refreshed: false };
  }

  if (!token.refresh_token) {
    throw new Error("Missing X refresh token");
  }

  const refreshed = await refreshAccessToken(token.refresh_token);
  const nextExpiresAt = new Date(
    Date.now() + ((refreshed.expires_in ?? 7200) - 60) * 1000,
  ).toISOString();

  // X refresh tokens are single-use. Persist the rotated refresh token before posting.
  const { error } = await supabase
    .from("x_oauth_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "x");

  if (error) {
    throw new Error(`Failed to persist rotated X refresh token: ${error.message}`);
  }

  return { accessToken: refreshed.access_token!, refreshed: true };
}

async function postTweet(
  accessToken: string,
  text: string,
  replyToTweetId?: string,
): Promise<{ id: string; text: string }> {
  const payload = replyToTweetId
    ? { text, reply: { in_reply_to_tweet_id: replyToTweetId } }
    : { text };

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as TweetResponse;
  if (!res.ok || !json.data?.id) {
    throw new Error(`X post failed ${res.status}: ${JSON.stringify(json)}`);
  }

  return { id: json.data.id, text: json.data.text };
}

async function postTweetWithRetry(
  accessToken: string,
  text: string,
  replyToTweetId?: string,
): Promise<{ id: string; text: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await postTweet(accessToken, text, replyToTweetId);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        console.warn("[x-post] X post attempt failed, retrying once:", toErrorMessage(error));
      }
    }
  }

  throw lastError;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clock = getNewYorkClock();
  const hours = allowedHours();

  if (!hours.includes(clock.hour)) {
    return NextResponse.json({
      ok: true,
      status: "outside_et_hour",
      et_date: clock.date,
      et_hour: clock.hour,
      allowed_et_hours: hours,
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: postedToday, error: postedError } = await supabase
    .from("x_post_draft")
    .select("id, draft_text")
    .eq("platform", "x")
    .eq("run_date", clock.date)
    .eq("status", "posted");

  if (postedError) {
    console.error("[x-post] DB error:", postedError.message);
    return NextResponse.json({ ok: false, error: postedError.message }, { status: 500 });
  }

  const postedCount = postedToday?.length ?? 0;
  if (postedCount >= POST_CAP_PER_DAY) {
    return NextResponse.json({ ok: true, status: "post_cap_reached", et_date: clock.date });
  }

  const urlBodyCount = (postedToday ?? [])
    .filter((row: { draft_text: string }) => hasUrl(row.draft_text))
    .length;

  const { data: drafts, error: draftError } = await supabase
    .from("x_post_draft")
    .select("id, run_date, angle, draft_text, link_url, created_at, post_attempts")
    .eq("platform", "x")
    .eq("run_date", clock.date)
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(20);

  if (draftError) {
    console.error("[x-post] DB error:", draftError.message);
    return NextResponse.json({ ok: false, error: draftError.message }, { status: 500 });
  }

  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ ok: true, status: "no_drafts", et_date: clock.date });
  }

  let pick: XPostDraft | null = null;
  const skipped: { id: string; issues: string[] }[] = [];

  for (const draft of drafts as XPostDraft[]) {
    const issues = bannedIssuesForX(draft.draft_text);

    if (draft.draft_text.length > 280) {
      issues.push(`too_long:${draft.draft_text.length}`);
    }

    if (hasUrl(draft.draft_text) && urlBodyCount >= URL_BODY_CAP_PER_DAY) {
      issues.push("url_body_cap_reached");
    }

    if (issues.length === 0) {
      pick = draft;
      break;
    }

    skipped.push({ id: draft.id, issues });
  }

  if (!pick) {
    return NextResponse.json({ ok: true, status: "no_clean_draft", skipped });
  }

  const live =
    process.env.LIVE_POSTING === "true" && process.env.X_DRY_RUN === "false";

  const { data: token, error: tokenError } = await supabase
    .from("x_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "x")
    .maybeSingle();

  if (tokenError) {
    console.error("[x-post] Token DB error:", tokenError.message);
    return NextResponse.json({ ok: false, error: tokenError.message }, { status: 500 });
  }

  const dryRunReasons = [
    ...(live ? [] : ["LIVE_POSTING_not_true_or_X_DRY_RUN_not_false"]),
    ...(token?.refresh_token || token?.access_token ? [] : ["missing_x_oauth_token"]),
    ...(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET ? [] : ["missing_x_client_env"]),
  ];

  if (dryRunReasons.length > 0) {
    console.log(`[x-post] DRY-RUN — would post draft ${pick.id}`);
    return NextResponse.json({
      ok: true,
      dry_run: true,
      reasons: dryRunReasons,
      et_date: clock.date,
      et_hour: clock.hour,
      would_post: {
        id: pick.id,
        angle: pick.angle,
        text: pick.draft_text,
        link_reply: pick.link_url,
      },
      skipped,
    });
  }

  const { data: locked, error: lockError } = await supabase
    .from("x_post_draft")
    .update({
      status: "posting",
      post_attempts: (pick.post_attempts ?? 0) + 1,
      last_error: null,
    })
    .eq("id", pick.id)
    .eq("status", "draft")
    .select("id, draft_text, link_url")
    .maybeSingle();

  if (lockError) {
    console.error("[x-post] Lock error:", lockError.message);
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }

  if (!locked) {
    return NextResponse.json({ ok: true, status: "already_claimed", draft_id: pick.id });
  }

  let access: { accessToken: string; refreshed: boolean };
  try {
    access = await getFreshAccessToken(supabase, token as XOAuthToken);
  } catch (error) {
    const message = toErrorMessage(error);
    await supabase
      .from("x_post_draft")
      .update({ status: "failed", last_error: message })
      .eq("id", pick.id);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let parent: { id: string; text: string };
  try {
    parent = await postTweetWithRetry(access.accessToken, locked.draft_text);
  } catch (error) {
    const message = toErrorMessage(error);
    await supabase
      .from("x_post_draft")
      .update({ status: "failed", last_error: message })
      .eq("id", pick.id);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let replyId: string | null = null;
  let replyError: string | null = null;

  if (locked.link_url && !hasUrl(locked.draft_text)) {
    try {
      const reply = await postTweetWithRetry(access.accessToken, locked.link_url, parent.id);
      replyId = reply.id;
    } catch (error) {
      replyError = toErrorMessage(error);
      console.error("[x-post] Link reply failed after parent post:", replyError);
    }
  }

  const { error: updateError } = await supabase
    .from("x_post_draft")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      x_post_id: parent.id,
      x_reply_id: replyId,
      last_error: replyError,
    })
    .eq("id", pick.id);

  if (updateError) {
    console.error("[x-post] Final DB update error:", updateError.message);
    return NextResponse.json({
      ok: false,
      error: updateError.message,
      posted_id: parent.id,
      posted_url: xUrl(parent.id),
      reply_error: replyError,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: replyError ? "posted_parent_reply_failed" : "posted",
    draft_id: pick.id,
    post_id: parent.id,
    post_url: xUrl(parent.id),
    reply_id: replyId,
    reply_url: replyId ? xUrl(replyId) : null,
    reply_error: replyError,
    refreshed_token: access.refreshed,
    skipped,
  });
}
