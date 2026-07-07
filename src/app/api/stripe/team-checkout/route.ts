import { stripe, STRIPE_TEAM_PRICE_ID, TRIAL_PERIOD_DAYS } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/security";
import { checkRateLimitDB } from "@/lib/rate-limit-db";
import { requestOrigin } from "@/lib/request-url";

// 5 checkout attempts per IP per 15 minutes (pre-auth, IP-based)
const CHECKOUT_RATE = { limit: 5, windowSec: 900 };

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // Rate limit: 5 checkout sessions per IP per 15 minutes (pre-auth, IP-based)
  const ip = getClientIp(req);
  const rl = await checkRateLimitDB(`checkout:ip:${ip}`, CHECKOUT_RATE);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  try {
    // Auth: userId and email come from the server session, not the request body
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!STRIPE_TEAM_PRICE_ID) {
      return NextResponse.json({ error: "Team plan not configured" }, { status: 500 });
    }

    const appUrl = requestOrigin(req);

    // Look up existing subscription — skip trial if record exists,
    // reuse stripe_customer_id to avoid creating duplicate customers
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const rawCustomerId = sub?.stripe_customer_id as string | null | undefined;
    const trialDays = sub ? 0 : TRIAL_PERIOD_DAYS;

    let liveCustomerId: string | null = null;
    if (rawCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(rawCustomerId);
        if (!customer.deleted) liveCustomerId = rawCustomerId;
      } catch {
        console.warn(`[team-checkout] Customer ${rawCustomerId} not found in current Stripe mode, using email fallback`);
      }
    }

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      payment_method_collection: "always",
      allow_promotion_codes: true,
      line_items: [{ price: STRIPE_TEAM_PRICE_ID, quantity: 1 }],
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { userId: user.id },
      },
      client_reference_id: user.id,
      metadata: { userId: user.id },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    };

    if (liveCustomerId) {
      sessionParams.customer = liveCustomerId;
    } else {
      sessionParams.customer_email = user.email ?? undefined;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    const { insertEvent } = await import("@/lib/analytics");
    insertEvent("checkout_started", user.id, { metadata: { plan: "team", session_id: session.id } });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[team-checkout] Stripe error:", error);
    return NextResponse.json({ error: "Failed to create team checkout session" }, { status: 500 });
  }
}
