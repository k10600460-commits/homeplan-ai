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
  const { error } = await supabase.from("seo_articles").select("id").limit(1);
  if (error) {
    console.error("[seo-draft] DB error:", error.message);
    return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
  }

  // Coming in Week 1 post-launch:
  // - Read priority keyword from obsidian-vault/seo-pipeline.md
  // - web_fetch top 3 competitor articles
  // - Extract builder-specific angles missing from competitors
  // - Generate 1200-1500 word draft via Claude API
  // - Insert into seo_articles (status='draft')
  // - Notify Shuraemon with preview URL
  console.log("[seo-draft] Skeleton fired — full implementation coming Week 1 post-launch");

  return NextResponse.json({ ok: true, status: "skeleton" });
}
