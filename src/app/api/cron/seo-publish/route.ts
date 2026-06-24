import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validate as validateContentQuality } from "@/lib/content-quality";
import { sendContentOpsAlertEmail } from "@/lib/emails";

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
// Shared quality gate: generation (seo-draft) and publishing both call
// validate() from the single source of truth (@/lib/content-quality) so the
// banned-word / length / structure rules can never drift between the two.

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
    const issues = validateContentQuality(d.title, d.description, d.draft_content);
    if (issues.length === 0) { pick = d; break; }
    skipped.push({ slug: d.slug, issues });
  }

  if (!pick) {
    const alertLines = [
      `${skipped.length} draft(s) failed the shared content-quality gate.`,
      ...skipped.slice(0, 20).map(s => `${s.slug}: ${s.issues.join(", ")}`),
    ];
    if (skipped.length > 20) alertLines.push(`...and ${skipped.length - 20} more.`);

    await sendContentOpsAlertEmail("Blog auto-publish blocked: no clean draft", alertLines);
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
