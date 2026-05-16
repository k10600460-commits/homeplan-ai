import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function upsertSubscription(
  userId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  // Active or trialing → pro plan; canceled/past_due → free
  const plan =
    subscription.status === "active" || subscription.status === "trialing"
      ? "pro"
      : "free";

  const { error: upsertError } = await supabase.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    stripe_price_id: item.price.id,
    plan,
    status: subscription.status,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    current_period_end: new Date(
      item.current_period_end * 1000,
    ).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
    if (upsertError) console.error("[webhook] upsert error:", JSON.stringify(upsertError));
    else console.log("[webhook] upsert success for userId:", userId);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
          console.log("[webhook] checkout userId:", userId, "client_reference_id:", session.client_reference_id, "metadata:", JSON.stringify(session.metadata));
        if (!userId) break;

        // Fetch the full subscription object
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await upsertSubscription(userId, subscription);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;
        await upsertSubscription(userId, subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // In API version 2026-04-22.dahlia, subscription lives under parent.subscription_details
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.userId;
        if (!userId) break;
        await upsertSubscription(userId, subscription);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
