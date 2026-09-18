import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { pushMessages } from "@/lib/line";
import { recordError } from "@/lib/observability";
import { recordHeartbeat } from "@/lib/heartbeat";
import { makeResolverDeps, resolveSubscriptionUserId } from "@/lib/subscription-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "reconcile-subscriptions";

/**
 * Daily Stripe -> Supabase reconciliation (OI-038).
 *
 * Why this exists: public.subscriptions had exactly one writer — the Stripe
 * webhook. There was no second path and nothing compared the two sides, so a
 * single permanently-failed delivery (wrong signing secret, an endpoint Stripe
 * auto-disabled after 3 days of 5xx, an outage during the one checkout we get)
 * would leave that customer charged and permanently on the free plan, unable
 * even to reach the billing portal to cancel — their only remaining move a
 * chargeback, and nobody would have known.
 *
 * So this does not merely alert, it heals. Stripe is the source of truth; the
 * local row is rewritten to match, using the same shape the webhook writes.
 * A failed webhook now self-corrects within 24h instead of never.
 *
 * Read-only against Stripe. The only writes are to public.subscriptions.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const healed: string[] = [];
  const unresolved: string[] = [];
  const staleLocal: string[] = [];

  try {
    // Stripe side (source of truth)
    const stripeSubs = await stripe.subscriptions
      .list({ status: "all", limit: 100 })
      .autoPagingToArray({ limit: 1000 });

    // Local side
    const { data: localRows, error: readErr } = await supabase
      .from("subscriptions")
      .select("user_id, stripe_subscription_id, status, plan");
    if (readErr) throw new Error(`subscriptions read failed: ${readErr.message}`);

    const localBySubId = new Map<string, { user_id: string; status: string; plan: string }>();
    for (const r of localRows ?? []) {
      if (r.stripe_subscription_id) {
        localBySubId.set(r.stripe_subscription_id, {
          user_id: r.user_id,
          status: r.status,
          plan: r.plan,
        });
      }
    }

    const resolverDeps = makeResolverDeps(stripe, supabase);

    for (const sub of stripeSubs) {
      const local = localBySubId.get(sub.id);
      const item = sub.items.data[0];
      if (!item) continue;

      const isActive = sub.status === "active" || sub.status === "trialing";
      const expectedPlan = isActive ? planFromPriceId(item.price.id) : "free";

      // Already in agreement — nothing to do.
      if (local && local.status === sub.status && local.plan === expectedPlan) continue;

      // Disagreement (or no local row at all). Find who this belongs to.
      const resolution = await resolveSubscriptionUserId(sub, resolverDeps);
      if (!resolution.userId) {
        // Money may have changed hands for somebody with no app account.
        // Never invent a user — surface it and let a human decide.
        unresolved.push(`${sub.id} (${resolution.email ?? String(sub.customer)})`);
        continue;
      }

      const { error: upErr } = await supabase.from("subscriptions").upsert(
        {
          user_id: resolution.userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer as string,
          stripe_price_id: item.price.id,
          plan: expectedPlan,
          status: sub.status,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_end: new Date(
            (item as Stripe.SubscriptionItem).current_period_end * 1000,
          ).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (upErr) throw new Error(`heal upsert failed for ${sub.id}: ${upErr.message}`);

      healed.push(
        `${sub.id}: ${local ? `${local.status}/${local.plan}` : "MISSING"} -> ${sub.status}/${expectedPlan}`,
      );
    }

    // Local rows claiming entitlement that Stripe has never heard of. NOT healed
    // automatically: revoking access is destructive, and one flaky Stripe list
    // must never strip a paying customer. Reported for a human instead.
    const stripeIds = new Set(stripeSubs.map((s) => s.id));
    for (const r of localRows ?? []) {
      const entitled = r.status === "active" || r.status === "trialing";
      if (entitled && r.stripe_subscription_id && !stripeIds.has(r.stripe_subscription_id)) {
        staleLocal.push(`${r.stripe_subscription_id} (user ${r.user_id}, local=${r.status})`);
      }
    }

    const drift = healed.length + unresolved.length + staleLocal.length;
    const summary = {
      ok: true,
      stripe_subscriptions: stripeSubs.length,
      local_rows: localRows?.length ?? 0,
      healed: healed.length,
      unresolved: unresolved.length,
      stale_local: staleLocal.length,
      detail: { healed, unresolved, staleLocal },
    };

    if (drift > 0) {
      const lines = [
        `Stripe/DB drift: healed ${healed.length}, unresolved ${unresolved.length}, stale ${staleLocal.length}`,
        ...healed.map((h) => `healed ${h}`),
        ...unresolved.map((u) => `UNRESOLVED ${u}`),
        ...staleLocal.map((s) => `STALE ${s}`),
      ];
      await recordError(`cron/${JOB}`, 500, lines.join(" | "));
      await pushMessages([
        { type: "text", text: `SplanAI 課金同期のズレ\n${lines.slice(0, 6).join("\n")}` },
      ]);
      // Healing succeeded, so the run is a success — but it must not look
      // identical to a clean day, hence WARN rather than ok.
      await recordHeartbeat(JOB, { ok: true, warn: lines[0] });
    } else {
      await recordHeartbeat(JOB, { ok: true });
    }

    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB}]`, msg);
    await recordError(`cron/${JOB}`, 500, msg, err instanceof Error ? err.stack : null);
    await recordHeartbeat(JOB, { ok: false, error: msg });
    // 500 so the failure also shows in Vercel's cron run history.
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
