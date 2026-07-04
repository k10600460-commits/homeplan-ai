import { stripe, planFromPriceId } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { insertEvent } from "@/lib/analytics";
import { pushMessages } from "@/lib/line";
import { recordError } from "@/lib/observability";
import {
  handleSubscriptionCreated,
  makeResolverDeps,
  notifyUnresolvedSubscription,
  resolveSubscriptionUserId,
  type SubscriptionSyncDeps,
} from "@/lib/subscription-sync";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function upsertSubscription(
  userId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const plan = isActive ? planFromPriceId(item.price.id) : "free";

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
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (upsertError) {
    // (codex review) fail-loud: swallowing this error let the created case
    // report 🎉「dashboard同期済み」on LINE while public.subscriptions stayed
    // unsynced. Throw instead → route returns 500 → Stripe retries the event
    // (funnel rows stay deduped via the stripe_event_id UNIQUE constraint).
    console.error("[webhook] upsert error:", JSON.stringify(upsertError));
    throw new Error(`subscriptions upsert failed: ${upsertError.message ?? JSON.stringify(upsertError)}`);
  }
}

// Shared user resolution for subscription events (DEC-0704C manual founding
// subs): metadata.userId → customer-email fallback (+ metadata backfill) →
// fail-loud LINE warning. See src/lib/subscription-sync.ts. Adds $0/day: LINE is
// free-tier and the extra Stripe calls only run inside webhook delivery.
const subSyncDeps: SubscriptionSyncDeps = {
  ...makeResolverDeps(stripe, supabase),
  upsertSubscription,
  insertFunnelEvent: insertEvent,
  planFromPriceId,
  pushLineText: async (text) => {
    await pushMessages([{ type: "text", text }]);
  },
  recordSyncError: (message) => recordError("stripe/webhook", 500, message),
};

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
        if (!userId) break;

        // Fetch the full subscription object
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await upsertSubscription(userId, subscription);

        // Funnel log — deduped by Stripe event id (UNIQUE constraint on stripe_event_id)
        const plan = planFromPriceId(subscription.items.data[0]?.price.id);
        if (subscription.status === "trialing") {
          insertEvent("trial_started", userId, {
            metadata: { plan, subscription_id: subscription.id },
            stripeEventId: event.id,
          });
        } else if (subscription.status === "active") {
          insertEvent("checkout_success", userId, {
            metadata: { plan, subscription_id: subscription.id },
            stripeEventId: event.id,
          });
        }
        break;
      }

      // Manual no-card founding subs are created in the Stripe Dashboard and
      // never pass through checkout — this case is what makes them sync (and
      // ping Shoji's LINE) with zero eyes-on-Dashboard.
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription, event.id, subSyncDeps);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const prev = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
        const { userId, email } = await resolveSubscriptionUserId(subscription, subSyncDeps);
        if (!userId) {
          await notifyUnresolvedSubscription(event.type, subscription, email, subSyncDeps);
          break;
        }
        await upsertSubscription(userId, subscription);

        // Send cancellation email when cancel_at_period_end flips to true
        const justCanceled =
          subscription.cancel_at_period_end === true &&
          prev?.cancel_at_period_end === false;
        if (justCanceled) {
          const item = subscription.items.data[0];
          const periodEnd = new Date(item.current_period_end * 1000).toLocaleDateString(
            "en-US", { year: "numeric", month: "long", day: "numeric" },
          );
          const plan = planFromPriceId(item.price.id);
          const { data: userData } = await supabase.auth.admin.getUserById(userId);
          if (userData.user?.email) {
            const { sendCancellationEmail } = await import("@/lib/emails");
            sendCancellationEmail(userData.user.email, periodEnd, plan).catch(console.error);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { userId, email } = await resolveSubscriptionUserId(subscription, subSyncDeps);
        if (!userId) {
          await notifyUnresolvedSubscription(event.type, subscription, email, subSyncDeps);
          break;
        }
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
        const { userId, email } = await resolveSubscriptionUserId(subscription, subSyncDeps);
        if (!userId) {
          await notifyUnresolvedSubscription(event.type, subscription, email, subSyncDeps);
          break;
        }
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
