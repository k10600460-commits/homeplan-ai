import { stripe, STRIPE_PRICE_ID, STRIPE_TEAM_PRICE_ID, TRIAL_PERIOD_DAYS } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
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

    const existingCustomerId = sub?.stripe_customer_id as string | null | undefined;
    // Skip trial if user already had one (existing subscription record)
    const trialDays = sub ? 0 : TRIAL_PERIOD_DAYS;

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "always",
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

    // Use existing customer ID if available, otherwise identify by email
    if (existingCustomerId) {
      sessionParams.customer = existingCustomerId;
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
