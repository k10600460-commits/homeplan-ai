import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WATCH_URLS = [
  "https://www.nar.realtor/policy-and-legal/idx-policy",
  "https://www.nar.realtor/about/policies/cooperation-policy",
  "https://www.reso.org/standards",
  "https://www.ftc.gov/business-guidance/blog",
] as const;

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
  const { error } = await supabase.from("legal_watch_diffs").select("id").limit(1);
  if (error) {
    console.error("[legal-watch] DB error:", error.message);
    return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
  }

  // Coming in Week 1 post-launch:
  // - Fetch each URL in WATCH_URLS
  // - Diff against last snapshot in legal_watch_diffs
  // - If diff >= 100 chars: assess impact via Claude API (High/Medium/Low)
  // - Insert into legal_watch_diffs
  // - High: send immediate email to Shuraemon
  // - Medium/Low: queue for next Daily Brief
  console.log(`[legal-watch] Skeleton fired — watching ${WATCH_URLS.length} URLs — full implementation coming Week 1 post-launch`);

  return NextResponse.json({ ok: true, status: "skeleton", urls: WATCH_URLS.length });
}
