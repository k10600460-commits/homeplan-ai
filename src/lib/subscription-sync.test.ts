/**
 * Unit tests for the Stripe subscription → app user sync layer (DEC-0704C
 * manual no-card founding subs). Run with: npx tsx src/lib/subscription-sync.test.ts
 * (Same plain-assert style as observability.test.ts / content-quality.test.ts.)
 *
 * Pure logic only — NO real Stripe / LINE / Supabase call anywhere: the deps
 * bag is faked in-memory and every fake records its calls for assertions.
 */
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  resolveSubscriptionUserId,
  makeResolverDeps,
  handleSubscriptionCreated,
  notifyUnresolvedSubscription,
  buildSubscriptionCreatedLineText,
  buildUnresolvedSubscriptionLineText,
  type ResolverDeps,
  type SubscriptionSyncDeps,
} from "./subscription-sync";

let passed = 0;

// ── Fakes ───────────────────────────────────────────────────────────────────

function fakeSub(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    metadata: {},
    items: { data: [{ price: { id: "price_pro" } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

interface Calls {
  retrieved: string[];
  emailLookups: string[];
  backfills: Array<{ subscriptionId: string; userId: string }>;
  upserts: Array<{ userId: string; subscriptionId: string }>;
  funnel: Array<{ eventName: string; userId: string; opts: { metadata?: Record<string, unknown>; stripeEventId?: string } }>;
  lineTexts: string[];
  syncErrors: string[];
}

function makeFakeDeps(opts: {
  customerEmail?: string | null;
  customerDeleted?: boolean;
  profileId?: string | null;
  backfillThrows?: boolean;
}): { deps: SubscriptionSyncDeps; calls: Calls } {
  const calls: Calls = {
    retrieved: [], emailLookups: [], backfills: [], upserts: [], funnel: [], lineTexts: [], syncErrors: [],
  };
  const deps: SubscriptionSyncDeps = {
    retrieveCustomer: async (customerId) => {
      calls.retrieved.push(customerId);
      if (opts.customerDeleted) {
        return { id: customerId, deleted: true } as unknown as Stripe.DeletedCustomer;
      }
      return { id: customerId, email: opts.customerEmail ?? null } as unknown as Stripe.Customer;
    },
    findProfileIdByEmail: async (email) => {
      calls.emailLookups.push(email);
      return opts.profileId ?? null;
    },
    backfillSubscriptionUserId: async (subscriptionId, userId) => {
      if (opts.backfillThrows) throw new Error("stripe update down");
      calls.backfills.push({ subscriptionId, userId });
    },
    upsertSubscription: async (userId, subscription) => {
      calls.upserts.push({ userId, subscriptionId: subscription.id });
    },
    insertFunnelEvent: (eventName, userId, o) => {
      calls.funnel.push({ eventName, userId, opts: o });
    },
    planFromPriceId: (priceId) => (priceId === "price_team" ? "team" : "pro"),
    pushLineText: async (text) => {
      calls.lineTexts.push(text);
    },
    recordSyncError: async (message) => {
      calls.syncErrors.push(message);
    },
  };
  return { deps, calls };
}

// ── resolveSubscriptionUserId ───────────────────────────────────────────────

async function resolverTests(): Promise<number> {
  let n = 0;

  // ① metadata.userId present → resolved via metadata, NO Stripe/DB call at all.
  {
    const throwing: ResolverDeps = {
      retrieveCustomer: async () => { throw new Error("must not be called"); },
      findProfileIdByEmail: async () => { throw new Error("must not be called"); },
      backfillSubscriptionUserId: async () => { throw new Error("must not be called"); },
    };
    const r = await resolveSubscriptionUserId(fakeSub({ metadata: { userId: "user-1" } }), throwing);
    assert.deepEqual(r, { userId: "user-1", via: "metadata", email: null, backfilled: false }, "metadata fast path");
    n++;
  }

  // ② no metadata + email found in profiles → resolved via email + backfilled.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "Builder@Example.com", profileId: "user-9" });
    const r = await resolveSubscriptionUserId(fakeSub(), deps);
    assert.deepEqual(r, { userId: "user-9", via: "email", email: "Builder@Example.com", backfilled: true }, "email fallback resolves");
    assert.deepEqual(calls.retrieved, ["cus_123"], "customer retrieved once");
    assert.deepEqual(calls.emailLookups, ["Builder@Example.com"], "profiles looked up by customer email");
    assert.deepEqual(calls.backfills, [{ subscriptionId: "sub_123", userId: "user-9" }], "metadata.userId backfilled to Stripe (self-heal)");
    n++;
  }

  // Backfill failure is best-effort: resolution still succeeds, backfilled=false.
  {
    const { deps } = makeFakeDeps({ customerEmail: "b@x.com", profileId: "user-9", backfillThrows: true });
    const r = await resolveSubscriptionUserId(fakeSub(), deps);
    assert.equal(r.userId, "user-9", "backfill failure does not block resolution");
    assert.equal(r.backfilled, false, "backfilled=false when Stripe update fails");
    n++;
  }

  // ③ no metadata + email NOT in profiles → unresolved but email is preserved
  //    (so the fail-loud LINE warning can name the builder).
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "stranger@x.com", profileId: null });
    const r = await resolveSubscriptionUserId(fakeSub(), deps);
    assert.deepEqual(r, { userId: null, via: null, email: "stranger@x.com", backfilled: false }, "unknown email → unresolved");
    assert.deepEqual(calls.backfills, [], "no backfill when unresolved");
    n++;
  }

  // Customer without email / deleted customer → unresolved, no profiles lookup.
  {
    const noEmail = makeFakeDeps({ customerEmail: null, profileId: "user-9" });
    const r1 = await resolveSubscriptionUserId(fakeSub(), noEmail.deps);
    assert.equal(r1.userId, null, "no customer email → unresolved");
    assert.deepEqual(noEmail.calls.emailLookups, [], "no profiles lookup without email");

    const deleted = makeFakeDeps({ customerDeleted: true, profileId: "user-9" });
    const r2 = await resolveSubscriptionUserId(fakeSub(), deleted.deps);
    assert.equal(r2.userId, null, "deleted customer → unresolved");
    n++;
  }

  // Expanded customer object (not a string id) still resolves via its .id.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "b@x.com", profileId: "user-9" });
    const sub = fakeSub({ customer: { id: "cus_obj" } });
    const r = await resolveSubscriptionUserId(sub, deps);
    assert.equal(r.userId, "user-9", "expanded customer object resolves");
    assert.deepEqual(calls.retrieved, ["cus_obj"], "uses expanded customer id");
    n++;
  }

  // Empty-string metadata.userId (Stripe's "unset") falls through to fallback.
  {
    const { deps } = makeFakeDeps({ customerEmail: "b@x.com", profileId: "user-9" });
    const r = await resolveSubscriptionUserId(fakeSub({ metadata: { userId: "" } }), deps);
    assert.equal(r.via, "email", "empty metadata.userId uses email fallback");
    n++;
  }

  return n;
}

// ── makeResolverDeps wiring (fake stripe/supabase — no network) ─────────────

async function wiringTests(): Promise<number> {
  let n = 0;

  const ilikeCalls: Array<{ column: string; pattern: string }> = [];
  let profileRows: unknown[] = [{ id: "user-42" }];
  let profileError: { message: string } | null = null;
  const fakeSupabase = {
    from: (table: string) => {
      assert.equal(table, "profiles", "resolver reads profiles table");
      return {
        select: () => ({
          ilike: (column: string, pattern: string) => {
            ilikeCalls.push({ column, pattern });
            return { limit: () => Promise.resolve({ data: profileRows, error: profileError }) };
          },
        }),
      };
    },
  };
  const subUpdates: Array<{ id: string; params: unknown }> = [];
  const fakeStripe = {
    customers: { retrieve: async (id: string) => ({ id, email: "b@x.com" }) },
    subscriptions: {
      update: async (id: string, params: unknown) => { subUpdates.push({ id, params }); },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps = makeResolverDeps(fakeStripe as any, fakeSupabase as any);

  // Email is lowercased AND ilike wildcards are escaped (a_b must not match aXb).
  {
    const id = await deps.findProfileIdByEmail("A_b%c\\d@X.com");
    assert.equal(id, "user-42", "profile id returned");
    assert.deepEqual(ilikeCalls[0], { column: "email", pattern: "a\\_b\\%c\\\\d@x.com" }, "lowercased + escaped ilike pattern");
    n++;
  }

  // DB read error THROWS (→ webhook 500 → Stripe retry) instead of reading as
  // "user not found" (which would mis-fire the signup-missing warning).
  {
    profileError = { message: "permission denied" };
    await assert.rejects(() => deps.findProfileIdByEmail("b@x.com"), /profiles lookup failed/, "DB error throws");
    profileError = null;
    n++;
  }

  // No row → null (genuine absence).
  {
    profileRows = [];
    assert.equal(await deps.findProfileIdByEmail("b@x.com"), null, "absent profile → null");
    profileRows = [{ id: "user-42" }];
    n++;
  }

  // Backfill sends a merge-only metadata update (never price/coupon params).
  {
    await deps.backfillSubscriptionUserId("sub_9", "user-42");
    assert.deepEqual(subUpdates, [{ id: "sub_9", params: { metadata: { userId: "user-42" } } }], "metadata-only subscription update");
    n++;
  }

  return n;
}

// ── handleSubscriptionCreated (sync + funnel dedup + LINE + fail-loud) ──────

async function createdCaseTests(): Promise<number> {
  let n = 0;

  // Manual founding sub (no metadata, email resolves, active) → upsert +
  // checkout_success funnel row (with stripeEventId for retry dedup) + LINE 🎉.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "builder@x.com", profileId: "user-9" });
    const out = await handleSubscriptionCreated(fakeSub({ status: "active" }), "evt_1", deps);
    assert.equal(out, "synced");
    assert.deepEqual(calls.upserts, [{ userId: "user-9", subscriptionId: "sub_123" }], "subscriptions table upserted");
    assert.deepEqual(calls.funnel, [{
      eventName: "checkout_success",
      userId: "user-9",
      opts: { metadata: { plan: "pro", subscription_id: "sub_123" }, stripeEventId: "evt_1" },
    }], "active → checkout_success with stripeEventId (UNIQUE dedup on Stripe retry)");
    assert.deepEqual(calls.lineTexts, ["🎉 サブスクリプション作成: pro / active / builder@x.com — dashboard同期済み"], "LINE push exact wording");
    assert.deepEqual(calls.syncErrors, [], "no error recorded on success");
    n++;
  }

  // trialing → trial_started.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "builder@x.com", profileId: "user-9" });
    await handleSubscriptionCreated(fakeSub({ status: "trialing" }), "evt_2", deps);
    assert.equal(calls.funnel[0]?.eventName, "trial_started", "trialing → trial_started");
    assert.equal(calls.lineTexts[0], "🎉 サブスクリプション作成: pro / trialing / builder@x.com — dashboard同期済み");
    n++;
  }

  // Self-serve checkout sub (metadata.userId present) → upsert + LINE but NO
  // funnel row here: checkout.session.completed already logs it and the two
  // events have different Stripe event ids, so inserting here would
  // double-count trial_started/checkout_success.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "x@x.com", profileId: "user-9" });
    await handleSubscriptionCreated(fakeSub({ metadata: { userId: "user-1" }, status: "trialing" }), "evt_3", deps);
    assert.deepEqual(calls.upserts, [{ userId: "user-1", subscriptionId: "sub_123" }], "metadata sub still upserted");
    assert.deepEqual(calls.funnel, [], "no funnel row for metadata-resolved sub (double-count guard)");
    assert.equal(calls.lineTexts.length, 1, "LINE still notifies");
    assert.ok(calls.lineTexts[0].includes("cus_123"), "falls back to customer id when email unknown");
    n++;
  }

  // Non-trialing/active status (e.g. incomplete) → upsert + LINE, no funnel row.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "builder@x.com", profileId: "user-9" });
    await handleSubscriptionCreated(fakeSub({ status: "incomplete" }), "evt_4", deps);
    assert.equal(calls.upserts.length, 1, "incomplete sub still synced");
    assert.deepEqual(calls.funnel, [], "no funnel row for non-trialing/active status");
    n++;
  }

  // Builder not signed up (email not in profiles) → fail-loud: NO upsert, NO
  // funnel, NO user creation — LINE ⚠️ warning + error_events row instead.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "notyet@x.com", profileId: null });
    const out = await handleSubscriptionCreated(fakeSub(), "evt_5", deps);
    assert.equal(out, "unresolved");
    assert.deepEqual(calls.upserts, [], "no upsert when user unknown");
    assert.deepEqual(calls.funnel, [], "no funnel when user unknown");
    assert.deepEqual(calls.lineTexts, [
      "⚠️ Stripe subが作成されたがappユーザー未発見: notyet@x.com。builderにsignup依頼→signup後にStripeでsubを軽く更新(メタデータ等)すれば自動同期",
    ], "fail-loud LINE warning exact wording");
    assert.equal(calls.syncErrors.length, 1, "error_events row recorded");
    assert.ok(calls.syncErrors[0].includes("sub_123") && calls.syncErrors[0].includes("notyet@x.com"), "error names sub + email");
    n++;
  }

  // (codex review) upsert failure must PROPAGATE (→ webhook 500 → Stripe
  // retry) before any funnel row or LINE ping — never a 🎉「同期済み」message
  // while public.subscriptions is actually unsynced.
  {
    const { deps, calls } = makeFakeDeps({ customerEmail: "builder@x.com", profileId: "user-9" });
    deps.upsertSubscription = async () => { throw new Error("db down"); };
    await assert.rejects(() => handleSubscriptionCreated(fakeSub({ status: "active" }), "evt_6", deps), /db down/, "upsert error propagates");
    assert.deepEqual(calls.funnel, [], "no funnel row when upsert failed");
    assert.deepEqual(calls.lineTexts, [], "no 🎉 LINE when upsert failed");
    n++;
  }

  // notifyUnresolvedSubscription for other event types names the event and
  // falls back to the customer id when no email is known.
  {
    const { deps, calls } = makeFakeDeps({});
    await notifyUnresolvedSubscription("customer.subscription.updated", fakeSub(), null, deps);
    assert.equal(
      calls.lineTexts[0],
      "⚠️ Stripe sub同期不可(customer.subscription.updated): appユーザー未発見: cus_123。builderにsignup依頼→signup後にStripeでsubを軽く更新(メタデータ等)すれば自動同期",
    );
    n++;
  }

  return n;
}

// ── Pure text builders ──────────────────────────────────────────────────────
{
  assert.equal(
    buildSubscriptionCreatedLineText("pro", "active", "b@x.com"),
    "🎉 サブスクリプション作成: pro / active / b@x.com — dashboard同期済み",
  );
  assert.equal(
    buildUnresolvedSubscriptionLineText("customer.subscription.created", "b@x.com"),
    "⚠️ Stripe subが作成されたがappユーザー未発見: b@x.com。builderにsignup依頼→signup後にStripeでsubを軽く更新(メタデータ等)すれば自動同期",
  );
  passed++;
}

Promise.all([resolverTests(), wiringTests(), createdCaseTests()])
  .then(([a, b, c]) => {
    console.log(`subscription-sync.test.ts: all ${passed + a + b + c} assertion groups passed ✅`);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
