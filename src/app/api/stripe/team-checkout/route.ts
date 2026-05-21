import { stripe, STRIPE_TEAM_PRICE_ID, TRIAL_PERIOD_DAYS } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId, email } = await req.json() as { userId?: string; email?: string };

    if (!userId || !email) {
      return NextResponse.json({ error: "userId and email are required" }, { status: 400 });
    }

    if (!STRIPE_TEAM_PRICE_ID) {
      return NextResponse.json({ error: "Team plan not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_collection: "always",
      line_items: [{ price: STRIPE_TEAM_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: { userId },
      },
      customer_email: email,
      client_reference_id: userId,
      metadata: { userId },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Team checkout error:", error);
    return NextResponse.json({ error: "Failed to create team checkout session" }, { status: 500 });
  }
}
