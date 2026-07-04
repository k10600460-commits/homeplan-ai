// Stripe subscription → app user sync (webhook resolver + created-case handler).
//
// Background (DEC-0704C / founding plan 案B): founding conversions are MANUAL
// no-card Subscriptions created by Shoji in the Stripe Dashboard. Those subs
// carry NO metadata.userId, so the previous webhook (metadata-only lookup)
// dropped every event for them — the sub never reached public.subscriptions and
// required eyes-on-Dashboard checking. This module unblocks that flow:
//
//   ① metadata.userId (self-serve checkout subs — unchanged fast path)
//   ② fallback: Stripe customer email → profiles.email (case-insensitive) → id,
//      then BACKFILL metadata.userId onto the Stripe subscription (self-heal:
//      later updated/deleted events resolve on path ① again). The backfill is a
//      webhook-internal auto-link — it never touches price/coupon/billing.
//   ③ still unresolved (builder not signed up yet) → fail-loud: LINE warning +
//      error_events row. NO auto user creation.
//
// Everything here is pure logic over an injected deps bag (no direct import of
// @/lib/stripe — that module throws without STRIPE_SECRET_KEY, which would break
// env-less unit tests). The webhook route wires real Stripe/Supabase/LINE impls
// via makeResolverDeps(); tests inject in-memory fakes.
//
// COST DECLARATION: this module adds $0/day of metered spend. No Claude call, no
// new cron, no new external meter. LINE push is free-tier; the only Stripe API
// calls (customers.retrieve + one-time metadata backfill) run inside webhook
// delivery — i.e. only when a subscription event actually fires (rare).

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Resolver ─────────────────────────────────────────────────────────────────

export interface ResolverDeps {
  /** stripe.customers.retrieve — may return a DeletedCustomer. Throws on API
   *  failure (webhook 500s → Stripe retries; transient errors self-recover). */
  retrieveCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  /** profiles.email case-insensitive exact match → profiles.id. Returns null
   *  when absent; throws on DB read error (→ 500 → Stripe retry, never
   *  misreported as "user not found"). */
  findProfileIdByEmail(email: string): Promise<string | null>;
  /** stripe.subscriptions.update(id, { metadata: { userId } }) — merge-only. */
  backfillSubscriptionUserId(subscriptionId: string, userId: string): Promise<void>;
}

export interface SubscriptionUserResolution {
  userId: string | null;
  /** Which path resolved the user (null when unresolved). */
  via: "metadata" | "email" | null;
  /** Customer email seen during the fallback (for LINE messages / warnings). */
  email: string | null;
  /** True when metadata.userId was written back to Stripe (self-heal). */
  backfilled: boolean;
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  const c = subscription.customer;
  return typeof c === "string" ? c : c.id ?? null;
}

/**
 * Resolve the app user for a Stripe subscription.
 * ① metadata.userId → ② customer email ↔ profiles.email (backfill metadata on
 * hit) → ③ null (caller must fail-loud via notifyUnresolvedSubscription).
 */
export async function resolveSubscriptionUserId(
  subscription: Stripe.Subscription,
  deps: ResolverDeps,
): Promise<SubscriptionUserResolution> {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) return { userId: metaUserId, via: "metadata", email: null, backfilled: false };

  // Fallback: manual Dashboard subs carry no metadata → resolve by customer email.
  const customerId = customerIdOf(subscription);
  if (!customerId) return { userId: null, via: null, email: null, backfilled: false };

  const customer = await deps.retrieveCustomer(customerId);
  const email = "deleted" in customer && customer.deleted ? null : (customer as Stripe.Customer).email ?? null;
  if (!email) return { userId: null, via: null, email: null, backfilled: false };

  const userId = await deps.findProfileIdByEmail(email);
  if (!userId) return { userId: null, via: null, email, backfilled: false };

  // Self-heal: write metadata.userId back to Stripe so every later
  // updated/deleted/payment_failed event resolves on the normal path ①.
  // Best-effort — a backfill failure must not block the sync we just achieved
  // (next event simply falls back to email again).
  let backfilled = false;
  try {
    await deps.backfillSubscriptionUserId(subscription.id, userId);
    backfilled = true;
  } catch (err) {
    console.error(
      `[subscription-sync] metadata backfill failed for ${subscription.id}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return { userId, via: "email", email, backfilled };
}

/** Wire the resolver to real Stripe + Supabase clients (webhook route side). */
export function makeResolverDeps(stripe: Stripe, supabase: SupabaseClient): ResolverDeps {
  return {
    retrieveCustomer: (customerId) => stripe.customers.retrieve(customerId),
    findProfileIdByEmail: async (email) => {
      // Case-insensitive exact match via ilike; escape ilike wildcards so an
      // address like a_b@x.com cannot pattern-match aXb@x.com.
      const pattern = email.toLowerCase().replace(/([\\%_])/g, "\\$1");
      const { data, error } = await supabase.from("profiles").select("id").ilike("email", pattern).limit(1);
      if (error) throw new Error(`profiles lookup failed: ${error.message}`);
      return (data?.[0] as { id: string } | undefined)?.id ?? null;
    },
    backfillSubscriptionUserId: async (subscriptionId, userId) => {
      // Stripe merges metadata keys on update — this only adds/sets userId and
      // never touches price, coupon, discount or billing settings.
      await stripe.subscriptions.update(subscriptionId, { metadata: { userId } });
    },
  };
}

// ── LINE message builders (pure — unit-tested exact wording) ─────────────────

export function buildSubscriptionCreatedLineText(plan: string, status: string, who: string): string {
  return `🎉 サブスクリプション作成: ${plan} / ${status} / ${who} — dashboard同期済み`;
}

export function buildUnresolvedSubscriptionLineText(eventType: string, who: string): string {
  const head =
    eventType === "customer.subscription.created"
      ? `⚠️ Stripe subが作成されたがappユーザー未発見: ${who}。`
      : `⚠️ Stripe sub同期不可(${eventType}): appユーザー未発見: ${who}。`;
  return `${head}builderにsignup依頼→signup後にStripeでsubを軽く更新(メタデータ等)すれば自動同期`;
}

// ── Fail-loud guard + created-case handler ───────────────────────────────────

export interface SubscriptionSyncDeps extends ResolverDeps {
  upsertSubscription(userId: string, subscription: Stripe.Subscription): Promise<void>;
  /** insertEvent from @/lib/analytics — stripeEventId dedups Stripe retries
   *  via the UNIQUE constraint on analytics_events.stripe_event_id. */
  insertFunnelEvent(
    eventName: string,
    userId: string,
    opts: { metadata?: Record<string, unknown>; stripeEventId?: string },
  ): void;
  planFromPriceId(priceId: string): string;
  /** pushMessages([{ type: "text", text }]) — best-effort, never throws. */
  pushLineText(text: string): Promise<void>;
  /** recordError("stripe/webhook", ...) — best-effort, never throws. */
  recordSyncError(message: string): Promise<void>;
}

/**
 * Fail-loud when no app user exists for a subscription event (builder has not
 * signed up yet): LINE warning + error_events row. Never creates a user.
 */
export async function notifyUnresolvedSubscription(
  eventType: string,
  subscription: Stripe.Subscription,
  email: string | null,
  deps: Pick<SubscriptionSyncDeps, "pushLineText" | "recordSyncError">,
): Promise<void> {
  const who = email ?? customerIdOf(subscription) ?? "unknown";
  console.error(`[webhook] ${eventType}: no app user found for subscription ${subscription.id} (${who})`);
  await deps.recordSyncError(`${eventType}: app user not found for subscription ${subscription.id} (${who})`);
  await deps.pushLineText(buildUnresolvedSubscriptionLineText(eventType, who));
}

/**
 * customer.subscription.created handler — the moment a manual no-card founding
 * sub is created in the Dashboard: resolve user → upsert into subscriptions →
 * funnel event → LINE push. Shoji's phone buzzes; no eyes-on-Dashboard needed.
 *
 * Funnel note: events are inserted ONLY for email-resolved (manual) subs.
 * Self-serve checkout subs carry metadata.userId and are already funnel-logged
 * by checkout.session.completed — logging them here too would double-count
 * trial_started / checkout_success (different Stripe event ids, so the
 * stripe_event_id UNIQUE dedup cannot catch the cross-event duplicate).
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  stripeEventId: string,
  deps: SubscriptionSyncDeps,
): Promise<"synced" | "unresolved"> {
  const resolution = await resolveSubscriptionUserId(subscription, deps);
  if (!resolution.userId) {
    await notifyUnresolvedSubscription("customer.subscription.created", subscription, resolution.email, deps);
    return "unresolved";
  }

  await deps.upsertSubscription(resolution.userId, subscription);

  const plan = deps.planFromPriceId(subscription.items.data[0]?.price.id);
  if (resolution.via === "email") {
    if (subscription.status === "trialing") {
      deps.insertFunnelEvent("trial_started", resolution.userId, {
        metadata: { plan, subscription_id: subscription.id },
        stripeEventId,
      });
    } else if (subscription.status === "active") {
      deps.insertFunnelEvent("checkout_success", resolution.userId, {
        metadata: { plan, subscription_id: subscription.id },
        stripeEventId,
      });
    }
  }

  const who = resolution.email ?? customerIdOf(subscription) ?? resolution.userId;
  await deps.pushLineText(buildSubscriptionCreatedLineText(plan, subscription.status, who));
  return "synced";
}
