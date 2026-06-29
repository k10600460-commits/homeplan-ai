import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifySignedPayload } from "@/lib/crypto";
import { cleanString, normalizeGrowthEmail } from "../_shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function confirmationHtml(message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center;color:#111827">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:12px">You're unsubscribed.</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.5">${message}</p>
</body></html>`;
}

async function resolveLeadId(supabase: SupabaseClient, leadId: string | null): Promise<string | null> {
  if (!leadId) return null;

  const { data, error } = await supabase
    .from("growth_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

async function ensureEmailSuppressed(supabase: SupabaseClient, email: string): Promise<boolean> {
  const existing = await supabase
    .from("growth_suppression_list")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    console.error("[growth/unsub] suppression lookup failed:", existing.error.message);
    return false;
  }

  if (existing.data?.id) {
    const { error } = await supabase
      .from("growth_suppression_list")
      .update({ reason: "unsubscribe" })
      .eq("id", existing.data.id);
    if (error) console.error("[growth/unsub] suppression update failed:", error.message);
    return !error;
  }

  const inserted = await supabase
    .from("growth_suppression_list")
    .insert({ email, reason: "unsubscribe" })
    .select("id")
    .single();

  if (!inserted.error) return true;

  if (inserted.error.code === "23505") {
    const retry = await supabase
      .from("growth_suppression_list")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (retry.error || !retry.data?.id) return false;

    const { error } = await supabase
      .from("growth_suppression_list")
      .update({ reason: "unsubscribe" })
      .eq("id", retry.data.id);
    return !error;
  }

  console.error("[growth/unsub] suppression insert failed:", inserted.error.message);
  return false;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let payload: Record<string, unknown> | null;
  try {
    payload = verifySignedPayload(token);
  } catch (err) {
    console.error("[growth/unsub] token verification unavailable:", err);
    return NextResponse.json({ error: "Unsubscribe verification unavailable" }, { status: 500 });
  }

  const email = normalizeGrowthEmail(payload?.email);
  if (!payload || !email) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const rawLeadId = cleanString(payload.lead_id, 80);
  if (rawLeadId && !UUID_RE.test(rawLeadId)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = serviceClient();
  const leadId = await resolveLeadId(supabase, rawLeadId);

  // CAN-SPAM: compliant cold sending also requires a physical mailing address
  // in the email footer. That is a separate human/virtual-office task.
  const request = await supabase
    .from("growth_unsubscribe_requests")
    .insert({
      email,
      lead_id: leadId,
      source: "email_link",
    })
    .select("id")
    .single();

  if (request.error) {
    console.error("[growth/unsub] request insert failed:", request.error.message);
    return NextResponse.json({ error: "Failed to record unsubscribe request" }, { status: 500 });
  }

  const suppressed = await ensureEmailSuppressed(supabase, email);
  if (!suppressed) {
    return NextResponse.json({ error: "Failed to honor unsubscribe request" }, { status: 500 });
  }

  const { error: honoredError } = await supabase
    .from("growth_unsubscribe_requests")
    .update({ honored_at: new Date().toISOString() })
    .eq("id", request.data.id);

  if (honoredError) {
    console.error("[growth/unsub] honored_at update failed:", honoredError.message);
    return NextResponse.json({ error: "Failed to mark unsubscribe request honored" }, { status: 500 });
  }

  return htmlResponse(confirmationHtml("You will no longer receive SplanAI prospecting emails."));
}
