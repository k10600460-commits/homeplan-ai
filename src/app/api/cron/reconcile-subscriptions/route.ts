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
 * public.subscriptions had exactly one writer — the Stripe webhook — and
 * nothing compared the two sides. One permanently-failed delivery would leave a
 * customer charged and stuck on the free plan, unable even to reach the billing
 * portal to cancel. This heals rather than alerts: Stripe is the truth and the
 * local row is rewritten to match, so a failed webhook self-corrects within 24h.
 *
 * Read-only against Stripe. The only writes are to public.subscriptions.
 */

/** Which of a customer's subscriptions decides their entitlement. */
function entitlementRank(status: Stripe.Subscription.Status): number {
  if (status === "active") return 3;
  if (status === "trialing") return 2;
  if (status === "past_due") return 1;
  return 0;
}

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
  const orphaned: string[] = [];
  const failed: string[] = [];
  const staleLocal: string[] = [];

  try {
    const stripeSubs = await stripe.subscriptions
      .list({ status: "all", limit: 100 })
      .autoPagingToArray({ limit: 1000 });

    const { data: localRows, error: readErr } = await supabase
      .from("subscriptions")
      .select("user_id, stripe_subscription_id, status, plan");
    if (readErr) throw new Error(`subscriptions read failed: ${readErr.message}`);

    // Keyed by USER, not by subscription id.
    //
    // The first version keyed the comparison by stripe_subscription_id. But
    // public.subscriptions holds one row per user (upsert onConflict: user_id)
    // while Stripe will happily give one customer several subscriptions. So
    // each of a user's subscriptions looked MISSING to the other, and the two
    // overwrote the same row on alternate days: four consecutive days of
    // "healed 1" that healed nothing, just oscillation. For a real customer
    // holding an old cancelled trial alongside a live subscription, that would
    // have dropped them to free every other day — this job causing the exact
    // outage it exists to prevent.
    //
    // A reconciler is only correct if the second run is a no-op. Resolve every
    // subscription to a user first, pick one winner per user, then compare.
    const localByUser = new Map<
      string,
      { stripe_subscription_id: string | null; status: string; plan: string }
    >();
    for (const r of localRows ?? []) {
      localByUser.set(r.user_id, {
        stripe_subscription_id: r.stripe_subscription_id,
        status: r.status,
        plan: r.plan,
      });
    }

    const resolverDeps = makeResolverDeps(stripe, supabase);

    const byUser = new Map<string, Stripe.Subscription[]>();
    for (const sub of stripeSubs) {
      if (!sub.items.data[0]) continue;
      const resolution = await resolveSubscriptionUserId(sub, resolverDeps);
      if (!resolution.userId) {
        // Money may have changed hands for somebody with no app account.
        // Never invent a user — surface it and let a human decide.
        unresolved.push(`${sub.id} (${resolution.email ?? String(sub.customer)})`);
        continue;
      }
      const list = byUser.get(resolution.userId) ?? [];
      list.push(sub);
      byUser.set(resolution.userId, list);
    }

    for (const [userId, subs] of byUser) {
      // Highest entitlement wins; newest breaks ties. This is the row the app
      // should read, so it is the row we write.
      const win = [...subs].sort(
        (a, b) => entitlementRank(b.status) - entitlementRank(a.status) || b.created - a.created,
      )[0];
      const item = win.items.data[0];
      if (!item) continue;

      const isActive = win.status === "active" || win.status === "trialing";
      const expectedPlan = isActive ? planFromPriceId(item.price.id) : "free";
      const local = localByUser.get(userId);

      // Idempotency check: subscription id included, so a second run is a no-op.
      if (
        local &&
        local.stripe_subscription_id === win.id &&
        local.status === win.status &&
        local.plan === expectedPlan
      ) {
        continue;
      }

      const { error: upErr } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_subscription_id: win.id,
          stripe_customer_id: win.customer as string,
          stripe_price_id: item.price.id,
          plan: expectedPlan,
          status: win.status,
          trial_end: win.trial_end ? new Date(win.trial_end * 1000).toISOString() : null,
          current_period_end: new Date(
            (item as Stripe.SubscriptionItem).current_period_end * 1000,
          ).toISOString(),
          cancel_at_period_end: win.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (upErr) {
        // One un-healable subscription must never abort the run: a genuine
        // paying customer further down the list would silently never be healed.
        // 23503 = foreign_key_violation. subscriptions.user_id references
        // auth.users ON DELETE CASCADE, and resolveSubscriptionUserId can hand
        // back a uuid from Stripe metadata for an account since deleted
        // (test-account cleanup, OI-017). Stripe keeps the subscription; the
        // app user is gone. Nothing to heal.
        if ((upErr as { code?: string }).code === "23503") {
          orphaned.push(`${win.id} (${win.status}, user ${userId} no longer exists)`);
        } else {
          failed.push(`${win.id}: ${upErr.message}`);
        }
        continue;
      }

      healed.push(
        `${win.id}: ${local ? `${local.status}/${local.plan}` : "MISSING"} -> ${win.status}/${expectedPlan}` +
          (subs.length > 1 ? ` (chosen from ${subs.length} subs for this user)` : ""),
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

    // Orphans are deliberately NOT actionable: a deleted test account with a
    // leftover Stripe subscription is permanent and benign. Paging a human about
    // it daily is how monitoring gets ignored — and then the alert that matters
    // gets ignored with it.
    const actionable = healed.length + unresolved.length + staleLocal.length + failed.length;
    const summary = {
      ok: true,
      stripe_subscriptions: stripeSubs.length,
      local_rows: localRows?.length ?? 0,
      users_seen: byUser.size,
      healed: healed.length,
      unresolved: unresolved.length,
      orphaned: orphaned.length,
      failed: failed.length,
      stale_local: staleLocal.length,
      detail: { healed, unresolved, orphaned, failed, staleLocal },
    };

    if (actionable > 0) {
      const lines = [
        `Stripe/DB drift: healed ${healed.length}, unresolved ${unresolved.length}, ` +
          `failed ${failed.length}, stale ${staleLocal.length} (orphaned ${orphaned.length}, ignored)`,
        ...healed.map((h) => `healed ${h}`),
        ...unresolved.map((u) => `UNRESOLVED ${u}`),
        ...failed.map((f) => `FAILED ${f}`),
        ...staleLocal.map((s) => `STALE ${s}`),
      ];
      await recordError(`cron/${JOB}`, 500, lines.join(" | "));
      await pushMessages([
        { type: "text", text: `SplanAI 課金同期のズレ\n${lines.slice(0, 6).join("\n")}` },
      ]);
      await recordHeartbeat(JOB, { ok: true, warn: lines[0] });
    } else if (orphaned.length > 0) {
      await recordHeartbeat(JOB, {
        ok: true,
        warn: `${orphaned.length} orphaned Stripe subscription(s), no action possible`,
      });
    } else {
      await recordHeartbeat(JOB, { ok: true });
    }

    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB}]`, msg);
    await recordError(`cron/${JOB}`, 500, msg, err instanceof Error ? err.stack : null);
    await recordHeartbeat(JOB, { ok: false, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
