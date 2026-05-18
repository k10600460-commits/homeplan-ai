import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const ADMIN_EMAIL = "k10600460@gmail.com";
const FROM_EMAIL = "SplanAI <noreply@homeplan-ai.com>";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel Cron call
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("[daily-brief] RESEND_API_KEY not set");
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resend = new Resend(resendKey);

  // Collect stats for the past 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [generationsResult, subscriptionsResult, usageResult] = await Promise.all([
    // Generations in last 24h (plan_generations may not exist yet — handle gracefully)
    supabase
      .from("plan_generations")
      .select("id, estimated_cost_usd", { count: "exact" })
      .gte("created_at", since),

    // Active subscriptions total
    supabase
      .from("subscriptions")
      .select("plan, status", { count: "exact" })
      .in("status", ["active", "trialing"]),

    // API usage for current month
    supabase
      .from("api_usage")
      .select("request_count, estimated_cost_usd"),
  ]);

  const generationCount = generationsResult.count ?? 0;
  const generationError = generationsResult.error?.message ?? null;
  const generationCost = (generationsResult.data ?? []).reduce(
    (sum, r) => sum + (Number(r.estimated_cost_usd) || 0),
    0,
  );

  const activeSubscriptions = subscriptionsResult.count ?? 0;

  const monthlyRequests = (usageResult.data ?? []).reduce(
    (sum, r) => sum + (r.request_count ?? 0),
    0,
  );
  const monthlyApiCost = (usageResult.data ?? []).reduce(
    (sum, r) => sum + (Number(r.estimated_cost_usd) || 0),
    0,
  );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });

  const html = buildEmailHtml({
    date: today,
    generationCount,
    generationCost,
    generationError,
    activeSubscriptions,
    monthlyRequests,
    monthlyApiCost,
  });

  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `SplanAI Daily Brief — ${today}`,
    html,
  });

  if (sendError) {
    console.error("[daily-brief] Send error:", sendError);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date: today, generationCount });
}

function buildEmailHtml(stats: {
  date: string;
  generationCount: number;
  generationCost: number;
  generationError: string | null;
  activeSubscriptions: number;
  monthlyRequests: number;
  monthlyApiCost: number;
}) {
  const {
    date,
    generationCount,
    generationCost,
    generationError,
    activeSubscriptions,
    monthlyRequests,
    monthlyApiCost,
  } = stats;

  const generationNote = generationError
    ? `<span style="color:#ef4444;font-size:12px;">(plan_generations table not yet applied — run schema.sql)</span>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">SplanAI Daily Brief</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">${date}</p>
    </div>

    <!-- Stats -->
    <div style="padding:32px 40px;">
      <h2 style="margin:0 0 20px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em;">Last 24 Hours</h2>

      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">
            Floor plan generations ${generationNote}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:20px;font-weight:700;color:#1e40af;">
            ${generationCount}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">Claude API cost (24h)</td>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:20px;font-weight:700;color:#1e40af;">
            $${generationCost.toFixed(4)}
          </td>
        </tr>
      </table>

      <h2 style="margin:28px 0 20px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em;">This Month</h2>

      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">Active Pro subscriptions</td>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:20px;font-weight:700;color:#10b981;">
            ${activeSubscriptions}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">Monthly MRR estimate</td>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:20px;font-weight:700;color:#10b981;">
            $${(activeSubscriptions * 49).toLocaleString()}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;">Total API requests</td>
          <td style="padding:14px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:20px;font-weight:700;color:#1e40af;">
            ${monthlyRequests.toLocaleString()}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0;color:#6b7280;font-size:14px;">Total Claude API cost</td>
          <td style="padding:14px 0;text-align:right;font-size:20px;font-weight:700;color:#1e40af;">
            $${monthlyApiCost.toFixed(2)}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        SplanAI · <a href="https://homeplan-ai.vercel.app/dashboard" style="color:#3b82f6;text-decoration:none;">Open Dashboard</a>
        · Automated by Vercel Cron at 7:00 AM JST
      </p>
    </div>

  </div>
</body>
</html>`;
}
