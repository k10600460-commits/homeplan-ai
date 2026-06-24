import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Publishes ONE vetted draft article per day (oldest-first) by flipping
// status -> 'published' and setting published_at. The blog routes are
// force-dynamic, so the post is live on the next request (no rebuild).
//
// SCHEDULE: vercel.json runs this at 12:30 UTC daily = 08:30 EDT (summer) /
// 07:30 EST (winter). Vercel crons are UTC-only; the ~1h winter drift is
// acceptable for a blog (publish time is not audience-sensitive like social).
// The social routes (x-post / fb-post) MUST instead re-gate on the
// America/New_York hour, because their timing matters.
//
// Quality gate: an auto-generated draft is only published if it passes the
// AI-smell / structure checks below. This is what makes "auto-publish" safe —
// it will NEVER ship a post containing banned hype words or thin structure.
// (Mirrors the SplanAI voice rules in the Obsidian vault:
//  SplanAI/60_ContentOps/config/channels.yml -> safety.banned_words.)

// AI-smell / hype words that must never reach the live blog. Word-boundary
// regexes (NOT bare substrings) to avoid false-positives on legit builder
// vocabulary. Intentionally EXCLUDES "disrupt(ion)" and "seamless" — both are
// normal home-building terms (market disruption, seamless gutters) and would
// wrongly skip good drafts. Mirrors the STRICT voice rules in the seo-draft
// prompt. TODO(codex): hoist both into ONE shared constant + validate at draft
// time so the generator can't produce drafts its own gate rejects.
const BANNED: RegExp[] = [
  /\bai[- ]powered\b/i,
  /\bgame[- ]chang/i,
  /\brevolutioniz/i,
  /\brevolutionary\b/i,
  /\bcutting[- ]edge\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\bsynerg/i,
  /\bleverag/i,
  /in today's fast-paced/i,
  /\bunlock the power\b/i,
  /excited to announce/i,
  /we're thrilled/i,
];

function qualityIssues(a: {
  title: string | null;
  draft_content: string | null;
  description: string | null;
}): string[] {
  const issues: string[] = [];
  const body = a.draft_content ?? "";
  const title = a.title ?? "";
  const desc = a.description ?? "";

  // Banned/AI-smell words must not appear in the body, the TITLE, or the META
  // DESCRIPTION — title + description are rendered on the blog and in OG/metadata.
  // (Per Codex review: a clean body with a "game-changing" title would otherwise pass.)
  for (const re of BANNED) {
    if (re.test(body)) issues.push(`banned:${re.source}`);
    if (re.test(title)) issues.push(`banned-title:${re.source}`);
    if (re.test(desc)) issues.push(`banned-desc:${re.source}`);
  }
  if (body.length < 600) issues.push(`too_short:${body.length}`);

  // The renderer strips a leading H1 that matches the title, so we don't require
  // an H1; >=3 H2 is the real structure signal (the draft prompt asks for 3-4).
  const h2 = (body.match(/^##\s+/gm) || []).length;
  if (h2 < 3) issues.push(`structure:h2_${h2}`);

  if (!desc) issues.push("missing_description");
  else if (desc.length < 110 || desc.length > 170) issues.push(`description_len:${desc.length}`);

  return issues;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Two-switch safety: live only when the global master AND the blog channel are on.
  const live =
    process.env.LIVE_POSTING === "true" && process.env.BLOG_DRY_RUN !== "true";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: drafts, error } = await supabase
    .from("seo_articles")
    .select("id, slug, title, description, draft_content, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(500); // scan the whole backlog (bounded by the keyword pool) so a run
                 // of dirty drafts at the front can't permanently starve a clean one.

  if (error) {
    console.error("[seo-publish] DB error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ ok: true, status: "no_drafts" });
  }

  // Oldest draft that passes the quality gate; collect skipped ones for the briefing.
  let pick: (typeof drafts)[number] | null = null;
  const skipped: { slug: string; issues: string[] }[] = [];
  for (const d of drafts) {
    const issues = qualityIssues(d);
    if (issues.length === 0) { pick = d; break; }
    skipped.push({ slug: d.slug, issues });
  }

  if (!pick) {
    console.warn("[seo-publish] No clean draft to publish.", JSON.stringify(skipped));
    return NextResponse.json({ ok: true, status: "no_clean_draft", skipped });
  }

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com"}/blog/${pick.slug}`;

  if (!live) {
    // DRY-RUN: report what WOULD publish; write nothing.
    console.log(`[seo-publish] DRY-RUN — would publish "${pick.slug}"`);
    return NextResponse.json({
      ok: true, dry_run: true, would_publish: pick.slug, title: pick.title, url, skipped,
    });
  }

  // LIVE: flip to published. The .eq("status","draft") guard prevents a double-publish race.
  const { data: updated, error: upErr } = await supabase
    .from("seo_articles")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", pick.id)
    .eq("status", "draft")
    .select("slug")
    .maybeSingle();

  if (upErr) {
    console.error("[seo-publish] Update error:", upErr.message);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  if (!updated) {
    // Lost the race (already published by a concurrent run) — not an error.
    return NextResponse.json({ ok: true, status: "already_published", slug: pick.slug });
  }

  console.log(`[seo-publish] Published "${pick.slug}" -> ${url}`);
  return NextResponse.json({ ok: true, published: pick.slug, title: pick.title, url, skipped });
}
