import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getClientIp } from "@/lib/security";
import { checkRateLimitDB } from "@/lib/rate-limit-db";
import { sendInquiryNotificationEmail } from "@/lib/emails";

// 5 inquiries per hour per IP — prevents spam while allowing real buyers
const INQUIRY_RATE = { limit: 5, windowSec: 3600 };

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Rate limit by IP
  const ip = getClientIp(req);
  const rl = await checkRateLimitDB(`portal_inquiry:ip:${ip}`, INQUIRY_RATE);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // Parse body
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });

  const buyerName:  string | null = body.buyerName  ? String(body.buyerName).trim().slice(0, 120)  : null;
  const buyerEmail: string | null = body.buyerEmail ? String(body.buyerEmail).trim().slice(0, 254) : null;
  const buyerPhone: string | null = body.buyerPhone ? String(body.buyerPhone).trim().slice(0, 30)  : null;
  const planIndex:  number | null = body.planIndex != null ? Number(body.planIndex) : null;
  const message:    string | null = body.message    ? String(body.message).trim().slice(0, 1000)   : null;

  // email OR phone required
  if (!buyerEmail && !buyerPhone) {
    return NextResponse.json({ ok: false, reason: "contact_required" }, { status: 400 });
  }

  // Basic email format check
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  const db = admin();
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";

  // Resolve slug → link (must be active)
  const { data: link } = await db
    .from("shared_links")
    .select("id, is_active, expires_at, user_id")
    .eq("slug", slug)
    .single();

  if (!link || !link.is_active) {
    return NextResponse.json({ ok: false, reason: "inactive" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, reason: "expired" }, { status: 410 });
  }

  const builderUserId: string = link.user_id;

  // Insert lead
  const { error: leadError } = await db.from("portal_leads").insert({
    link_id:         link.id,
    builder_user_id: builderUserId,
    buyer_name:      buyerName,
    buyer_email:     buyerEmail,
    buyer_phone:     buyerPhone,
    plan_index:      planIndex,
    message,
    status:          "new",
  });

  if (!leadError) {
    const { insertEvent } = await import("@/lib/analytics");
    insertEvent("portal_lead_created", builderUserId, {
      metadata: { link_id: link.id, slug, has_email: !!buyerEmail, has_phone: !!buyerPhone },
    });
  }

  // Record link_event 'inquiry'
  const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  const ipHash = createHash("sha256")
    .update(rawIp + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(0, 16))
    .digest("hex");

  try {
    await db.rpc("record_link_view", {
      p_link_id:    link.id,
      p_event_type: "inquiry",
      p_plan_index: planIndex,
      p_referrer:   null,
      p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 512) || null,
      p_ip_hash:    ipHash,
    });
  } catch { /* non-blocking — inquiry saved regardless */ }

  // Fetch builder's email for notification
  const { data: profile } = await db
    .from("profiles")
    .select("email")
    .eq("id", builderUserId)
    .maybeSingle();

  // Fire-and-forget (M4): the lead is already saved — a Resend outage must not
  // surface a 500 to the buyer (which triggers resubmits → duplicate leads).
  if (profile?.email) {
    sendInquiryNotificationEmail(profile.email, {
      buyerName,
      buyerEmail,
      buyerPhone,
      planIndex,
      message,
      portalSlug: slug,
      portalUrl:  `${APP_URL}/s/${slug}`,
    }).catch(err => console.error("[inquiry] notification email failed:", err));
  }

  return NextResponse.json({ ok: true });
}
