import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validate as validateContentQuality } from "@/lib/content-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel cron is UTC-only. Facebook timing matters, so this route re-gates on
// America/New_York before selecting a draft or posting.
const POST_CAP_PER_DAY = 1;
const DEFAULT_ET_HOUR = 12;

type FbPostDraft = {
  id: string;
  run_date: string;
  message: string;
  post_attempts: number | null;
  created_at: string;
};

type FacebookFeedResponse = {
  id?: string;
  error?: unknown;
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

function allowedHour(): number {
  const parsed = Number(process.env.FB_POST_HOUR_ET ?? DEFAULT_ET_HOUR);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : DEFAULT_ET_HOUR;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function facebookUrl(id: string): string {
  return `https://www.facebook.com/${id}`;
}

function bannedIssuesForFacebook(text: string): string[] {
  // validate() is blog-oriented. For Facebook, reuse it as the banned-term source
  // and ignore blog-only length / description / structure issues.
  return validateContentQuality(
    "Facebook post",
    "Plain SplanAI Facebook Page post for home builders, checked only for banned terms.",
    text,
  ).filter(issue => issue.startsWith("banned"));
}

async function recordFailure(
  supabase: SupabaseClient,
  draftId: string,
  message: string,
) {
  await supabase
    .from("fb_post_draft")
    .update({
      status: "failed",
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
}

async function postToFacebook(message: string): Promise<{ id: string }> {
  if (!process.env.FB_PAGE_ID || !process.env.FB_PAGE_ACCESS_TOKEN) {
    throw new Error("Missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN");
  }

  const body = new URLSearchParams({
    message,
    access_token: process.env.FB_PAGE_ACCESS_TOKEN,
  });

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${process.env.FB_PAGE_ID}/feed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const json = (await res.json()) as FacebookFeedResponse;
  if (!res.ok || !json.id) {
    throw new Error(`Facebook post failed ${res.status}: ${JSON.stringify(json)}`);
  }

  return { id: json.id };
}

async function postToFacebookWithRetry(message: string): Promise<{ id: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await postToFacebook(message);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        console.warn("[fb-post] Facebook post attempt failed, retrying once:", toErrorMessage(error));
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
  const hour = allowedHour();

  if (clock.hour !== hour) {
    return NextResponse.json({
      ok: true,
      status: "outside_et_hour",
      et_date: clock.date,
      et_hour: clock.hour,
      allowed_et_hour: hour,
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: postedToday, error: postedError } = await supabase
    .from("fb_post_draft")
    .select("id")
    .eq("run_date", clock.date)
    .eq("status", "posted");

  if (postedError) {
    console.error("[fb-post] DB error:", postedError.message);
    return NextResponse.json({ ok: false, error: postedError.message }, { status: 500 });
  }

  if ((postedToday?.length ?? 0) >= POST_CAP_PER_DAY) {
    return NextResponse.json({ ok: true, status: "post_cap_reached", et_date: clock.date });
  }

  const { data: drafts, error: draftError } = await supabase
    .from("fb_post_draft")
    .select("id, run_date, message, post_attempts, created_at")
    .eq("run_date", clock.date)
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(20);

  if (draftError) {
    console.error("[fb-post] DB error:", draftError.message);
    return NextResponse.json({ ok: false, error: draftError.message }, { status: 500 });
  }

  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ ok: true, status: "no_drafts", et_date: clock.date });
  }

  let pick: FbPostDraft | null = null;
  const skipped: { id: string; issues: string[] }[] = [];

  for (const draft of drafts as FbPostDraft[]) {
    const issues = bannedIssuesForFacebook(draft.message);

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
    process.env.LIVE_POSTING === "true" && process.env.FB_DRY_RUN === "false";

  const dryRunReasons = [
    ...(live ? [] : ["LIVE_POSTING_not_true_or_FB_DRY_RUN_not_false"]),
    ...(process.env.FB_PAGE_ID ? [] : ["missing_FB_PAGE_ID"]),
    ...(process.env.FB_PAGE_ACCESS_TOKEN ? [] : ["missing_FB_PAGE_ACCESS_TOKEN"]),
  ];

  if (dryRunReasons.length > 0) {
    console.log(`[fb-post] DRY-RUN - would post draft ${pick.id}`);
    return NextResponse.json({
      ok: true,
      dry_run: true,
      reasons: dryRunReasons,
      et_date: clock.date,
      et_hour: clock.hour,
      would_post: {
        id: pick.id,
        message: pick.message,
      },
      skipped,
    });
  }

  const { data: locked, error: lockError } = await supabase
    .from("fb_post_draft")
    .update({
      status: "posting",
      post_attempts: (pick.post_attempts ?? 0) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pick.id)
    .eq("status", "draft")
    .select("id, message")
    .maybeSingle();

  if (lockError) {
    console.error("[fb-post] Lock error:", lockError.message);
    return NextResponse.json({ ok: false, error: lockError.message }, { status: 500 });
  }

  if (!locked) {
    return NextResponse.json({ ok: true, status: "already_claimed", draft_id: pick.id });
  }

  let posted: { id: string };
  try {
    posted = await postToFacebookWithRetry(locked.message);
  } catch (error) {
    const message = toErrorMessage(error);
    await recordFailure(supabase, pick.id, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const postedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("fb_post_draft")
    .update({
      status: "posted",
      fb_post_id: posted.id,
      posted_at: postedAt,
      last_error: null,
      updated_at: postedAt,
    })
    .eq("id", pick.id);

  if (updateError) {
    console.error("[fb-post] Final DB update error:", updateError.message);
    return NextResponse.json({
      ok: false,
      error: updateError.message,
      posted_id: posted.id,
      posted_url: facebookUrl(posted.id),
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "posted",
    draft_id: pick.id,
    post_id: posted.id,
    post_url: facebookUrl(posted.id),
    skipped,
  });
}
