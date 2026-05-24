import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTrialReminderEmail } from "@/lib/emails";

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

  // Find trials ending in 3 days (±12h window)
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  const from = new Date(in3Days); from.setHours(0, 0, 0, 0);
  const to   = new Date(in3Days); to.setHours(23, 59, 59, 999);

  const { data: trials } = await supabase
    .from("subscriptions")
    .select("user_id, trial_end, plan")
    .eq("status", "trialing")
    .gte("trial_end", from.toISOString())
    .lte("trial_end", to.toISOString());

  if (!trials?.length) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  for (const row of trials) {
    const { data: user } = await supabase.auth.admin.getUserById(row.user_id);
    if (user.user?.email) {
      const dateStr = new Date(row.trial_end).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });
      const plan = row.plan === "team" ? "team" : "pro";
      await sendTrialReminderEmail(user.user.email, dateStr, plan).catch(console.error);
      sent++;
    }
  }

  return NextResponse.json({ sent });
}
