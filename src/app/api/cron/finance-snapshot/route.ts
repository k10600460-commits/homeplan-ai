import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { error } = await supabase.from("finance_snapshots").select("id").limit(1);
  if (error) {
    console.error("[finance-snapshot] DB error:", error.message);
    return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
  }

  // Coming in Week 1 post-launch:
  // - MRR / ARR from Stripe subscriptions
  // - Active Pro / Team / Trialing counts
  // - Churned / Refunded today
  // - Anthropic + Resend API cost from usage logs
  // - Phase judgment (0/1/2/3) based on MRR
  // - Insert into finance_snapshots
  console.log("[finance-snapshot] Skeleton fired — full implementation coming Week 1 post-launch");

  return NextResponse.json({ ok: true, status: "skeleton" });
}
