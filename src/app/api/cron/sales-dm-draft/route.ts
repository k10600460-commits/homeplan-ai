import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GrowthDraftTarget = {
  growthLeadId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  type?: "dm" | "follow_up" | null;
  templateKey?: string | null;
  bodyExcerpt?: string | null;
};

async function logGrowthOutreachEventForDraft(
  supabase: SupabaseClient,
  target: GrowthDraftTarget | null,
) {
  if (!target?.growthLeadId) return;

  const { data: lead, error: leadError } = await supabase
    .from("growth_leads")
    .select("id")
    .eq("id", target.growthLeadId)
    .maybeSingle();

  if (leadError || !lead) {
    if (leadError) console.warn("[sales-dm-draft] Growth lead lookup skipped:", leadError.message);
    return;
  }

  const { error: eventError } = await supabase
    .from("growth_outreach_events")
    .insert({
      lead_id: lead.id,
      contact_id: target.contactId ?? null,
      campaign_id: target.campaignId ?? null,
      channel: "linkedin",
      type: target.type === "follow_up" ? "follow_up" : "dm",
      direction: "outbound",
      template_key: target.templateKey ?? null,
      body_excerpt: target.bodyExcerpt?.slice(0, 2000) ?? null,
      metadata: { source: "sales-dm-draft" },
    });

  if (eventError) {
    console.warn("[sales-dm-draft] Growth outreach event skipped:", eventError.message);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Supabase 接続確認
  const { error } = await supabase.from("outreach_log").select("id").limit(1);
  if (error) {
    console.error("[sales-dm-draft] DB error:", error.message);
    return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
  }

  // Coming in Week 1 post-launch:
  // - Fetch 5 pending companies from outreach_log (TX/FL/NC priority)
  // - web_fetch each company's website / Facebook
  // - Apply DM pattern selection logic (A-E) from agents/sales.md §4
  // - Generate personalized DM drafts via Claude API
  // - Save to obsidian-vault/YYYY-MM-DD-sales-drafts.md
  // - Notify Shuraemon via daily-brief escalation
  await logGrowthOutreachEventForDraft(supabase, null);
  console.log("[sales-dm-draft] Skeleton fired — full implementation coming Week 1 post-launch");

  return NextResponse.json({ ok: true, status: "skeleton" });
}
