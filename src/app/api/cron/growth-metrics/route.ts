import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyMetrics = {
  metric_date: string;
  connects_sent: number;
  dms_sent: number;
  emails_sent: number;
  follow_ups_sent: number;
  connect_accepts: number;
  replies: number;
  positive_replies: number;
  proposals_built: number;
  demos_booked: number;
  trials_started: number;
  paid_new: number;
  mrr: number | null;
  bounce_rate: number | null;
  complaint_rate: number | null;
  updated_at: string;
};

async function readCount(result: { count: number | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

async function countOutreachType(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  type: "connect_request" | "dm" | "email_sent" | "follow_up" | "connect_accepted",
) {
  return readCount(await supabase
    .from("growth_outreach_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .eq("type", type));
}

async function countReplies(supabase: SupabaseClient, fromIso: string, toIso: string) {
  return readCount(await supabase
    .from("growth_outreach_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .or("type.eq.email_reply,direction.eq.inbound"));
}

async function countPositiveReplies(supabase: SupabaseClient, fromIso: string, toIso: string) {
  return readCount(await supabase
    .from("growth_outreach_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .eq("direction", "inbound")
    .eq("sentiment", "pos"));
}

async function countProposalsBuilt(supabase: SupabaseClient, fromIso: string, toIso: string) {
  return readCount(await supabase
    .from("growth_generated_proposals")
    .select("id", { count: "exact", head: true })
    .gte("built_at", fromIso)
    .lt("built_at", toIso));
}

async function countLeadsByStage(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  stage: "demo_scheduled" | "trial" | "won",
) {
  // Approximation: until stage transition history exists, updated_at is used as the date a lead entered this stage.
  return readCount(await supabase
    .from("growth_leads")
    .select("id", { count: "exact", head: true })
    .gte("updated_at", fromIso)
    .lt("updated_at", toIso)
    .eq("stage", stage));
}

function todayUtcWindow() {
  const now = new Date();
  const metricDate = now.toISOString().slice(0, 10);
  const from = new Date(`${metricDate}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);

  return {
    metricDate,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
  };
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
  const { metricDate, fromIso, toIso } = todayUtcWindow();

  try {
    const [
      connectsSent,
      dmsSent,
      emailsSent,
      followUpsSent,
      connectAccepts,
      replies,
      positiveReplies,
      proposalsBuilt,
      demosBooked,
      trialsStarted,
      paidNew,
    ] = await Promise.all([
      countOutreachType(supabase, fromIso, toIso, "connect_request"),
      countOutreachType(supabase, fromIso, toIso, "dm"),
      countOutreachType(supabase, fromIso, toIso, "email_sent"),
      countOutreachType(supabase, fromIso, toIso, "follow_up"),
      countOutreachType(supabase, fromIso, toIso, "connect_accepted"),
      countReplies(supabase, fromIso, toIso),
      countPositiveReplies(supabase, fromIso, toIso),
      countProposalsBuilt(supabase, fromIso, toIso),
      countLeadsByStage(supabase, fromIso, toIso, "demo_scheduled"),
      countLeadsByStage(supabase, fromIso, toIso, "trial"),
      countLeadsByStage(supabase, fromIso, toIso, "won"),
    ]);

    const payload: DailyMetrics = {
      metric_date: metricDate,
      connects_sent: connectsSent,
      dms_sent: dmsSent,
      emails_sent: emailsSent,
      follow_ups_sent: followUpsSent,
      connect_accepts: connectAccepts,
      replies,
      positive_replies: positiveReplies,
      proposals_built: proposalsBuilt,
      demos_booked: demosBooked,
      trials_started: trialsStarted,
      paid_new: paidNew,
      // To be wired later from subscriptions and deliverability signals.
      mrr: null,
      bounce_rate: null,
      complaint_rate: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("growth_daily_metrics")
      .upsert(payload, { onConflict: "metric_date" })
      .select()
      .single();

    if (error) {
      console.error("[growth-metrics] upsert failed:", error.message);
      return NextResponse.json({ error: "Failed to save growth metrics" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      metric_date: metricDate,
      window: { from: fromIso, to: toIso },
      metrics: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[growth-metrics] aggregation failed:", message);
    return NextResponse.json({ error: "Failed to aggregate growth metrics" }, { status: 500 });
  }
}
