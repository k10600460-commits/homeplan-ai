import { stripe, STRIPE_PRICE_ID, STRIPE_TEAM_PRICE_ID, TRIAL_PERIOD_DAYS } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/lib/security";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // Rate limit: 5 checkout sessions per IP per 15 minutes
  const ip = getClientIp(req);
  const rl = checkRateLimit(`checkout:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = await req.json() as { plan?: string };
    const priceId = plan === "team" ? STRIPE_TEAM_PRICE_ID : STRIPE_PRICE_ID;

    if (!priceId) {
      return NextResponse.json({ error: `Price ID not configured for plan: ${plan ?? "pro"}` }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Look up existing Stripe customer ID from subscriptions table
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const rawCustomerId = sub?.stripe_customer_id as string | null | undefined;
    // Skip trial if user already had one (existing subscription record)
    const trialDays = sub ? 0 : TRIAL_PERIOD_DAYS;

    // Verify customer exists in the current Stripe mode (live vs test).
    // A test-mode customer ID used with a live key throws "no such customer".
    let liveCustomerId: string | null = null;
    if (rawCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(rawCustomerId);
        if (!customer.deleted) liveCustomerId = rawCustomerId;
      } catch {
        // Customer doesn't exist in this mode — fall back to customer_email
        console.warn(`[checkout] Customer ${rawCustomerId} not found in current Stripe mode, using email fallback`);
      }
    }

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      payment_method_collection: "always",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
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

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const stripeMsg = error instanceof Error ? error.message : String(error);
    console.error("[checkout] Stripe error:", stripeMsg);
    return NextResponse.json(
      { error: `Checkout failed: ${stripeMsg}` },
      { status: 500 },
    );
  }
}
