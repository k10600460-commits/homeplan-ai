// ── Signup-free demo guard (/try) ─────────────────────────────────────────────
// Strict, DB-backed, FAIL-CLOSED gate for the anonymous sample generation.
// Deliberately independent from rate-limit-db (which fails OPEN) — every Claude
// call here costs real money, so if the DB is unreachable we refuse to generate.
//
// Policy (codex-reviewed):
//   - One demo per visitor, permanently, keyed on BOTH hashed IP and cookie id
//     (unique indexes in demo_usage enforce this even under concurrent requests).
//   - A revisit whose row already has a stored result gets the same result back
//     (no new Claude call). A row without a result (claimed / in-flight) blocks.
//   - Stale-claim TTL: a claim with no result older than STALE_CLAIM_MS is a
//     crashed/timed-out generation — it is deleted so the visitor can retry
//     (claims must not lock a visitor out forever; codex High #1).
//   - Global cap: at most DEMO_DAILY_CAP rows per rolling 24h. The cap is
//     re-verified AFTER insert and the own claim rolled back on overshoot, so
//     concurrent requests cannot meaningfully exceed it (codex High #2).
//   - Any storage error → { ok: false, reason: "db_unavailable" } (fail-closed).

import { createClient } from "@supabase/supabase-js";

export const DEMO_DAILY_CAP = 50;
/** Claims without a result older than this are considered crashed and retryable. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export interface DemoClaimRow {
  id: string;
  result: unknown | null;
  createdAt: string; // ISO
}

// Minimal storage interface so the guard logic is unit-testable without a DB.
// Implementations THROW on infrastructure errors; the guard converts throws
// into a fail-closed rejection.
export interface DemoStore {
  /** Row matching this cookie id OR ip hash, if any. */
  findExisting(ipHash: string, cookieId: string): Promise<DemoClaimRow | null>;
  /** Number of rows created since the given ISO timestamp. */
  countCreatedSince(sinceIso: string): Promise<number>;
  /** Insert a claim row. Returns "duplicate" on unique-index violation. */
  insertClaim(ipHash: string, cookieId: string): Promise<{ outcome: "inserted"; id: string } | { outcome: "duplicate" }>;
  /** Delete a claim row (stale recovery / cap rollback / failed generation). */
  deleteClaim(id: string): Promise<void>;
}

export type DemoGuardResult =
  | { ok: true; claimId: string }
  | { ok: false; reason: "already_used"; existingResult: unknown | null }
  | { ok: false; reason: "daily_cap" }
  | { ok: false; reason: "db_unavailable" };

/**
 * Check eligibility AND claim the demo slot in one step.
 * Claim-before-generate: the row is inserted before the Claude call so two
 * concurrent first-timers can never both generate (second insert = duplicate).
 * Callers must saveResult() on success or releaseDemoClaim() on failure.
 */
export async function checkAndClaimDemo(
  store: DemoStore,
  ipHash: string,
  cookieId: string,
  dailyCap: number = DEMO_DAILY_CAP,
  now: () => number = Date.now,
): Promise<DemoGuardResult> {
  try {
    const existing = await store.findExisting(ipHash, cookieId);
    if (existing) {
      if (existing.result) {
        return { ok: false, reason: "already_used", existingResult: existing.result };
      }
      const age = now() - Date.parse(existing.createdAt);
      if (Number.isFinite(age) && age <= STALE_CLAIM_MS) {
        // Fresh claim without a result: generation in flight (or just crashed).
        return { ok: false, reason: "already_used", existingResult: null };
      }
      // Crashed/abandoned claim — free the slot and let this attempt proceed.
      await store.deleteClaim(existing.id);
    }

    const since = new Date(now() - 24 * 60 * 60 * 1000).toISOString();
    if ((await store.countCreatedSince(since)) >= dailyCap) {
      return { ok: false, reason: "daily_cap" };
    }

    const claim = await store.insertClaim(ipHash, cookieId);
    if (claim.outcome === "duplicate") {
      // Concurrent request from the same visitor won the race.
      return { ok: false, reason: "already_used", existingResult: null };
    }

    // Post-insert verification closes the count→insert race window: on
    // overshoot every over-the-cap claimant rolls itself back (cost-safe;
    // may briefly over-reject at the boundary, never over-spend).
    if ((await store.countCreatedSince(since)) > dailyCap) {
      await store.deleteClaim(claim.id);
      return { ok: false, reason: "daily_cap" };
    }

    return { ok: true, claimId: claim.id };
  } catch (err) {
    console.error("[demo-guard] storage error — failing closed:", err);
    return { ok: false, reason: "db_unavailable" };
  }
}

// ── Supabase-backed store (service role) ─────────────────────────────────────

const PG_UNIQUE_VIOLATION = "23505";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function createSupabaseDemoStore(): DemoStore {
  const supabase = admin();
  return {
    async findExisting(ipHash, cookieId) {
      const { data, error } = await supabase
        .from("demo_usage")
        .select("id, result, created_at")
        .or(`cookie_id.eq.${cookieId},ip_hash.eq.${ipHash}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id as string, result: data.result ?? null, createdAt: data.created_at as string }
        : null;
    },

    async countCreatedSince(sinceIso) {
      const { count, error } = await supabase
        .from("demo_usage")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceIso);
      if (error) throw error;
      if (count === null || count === undefined) throw new Error("count unavailable");
      return count;
    },

    async insertClaim(ipHash, cookieId) {
      const { data, error } = await supabase
        .from("demo_usage")
        .insert({ ip_hash: ipHash, cookie_id: cookieId })
        .select("id")
        .single();
      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) return { outcome: "duplicate" as const };
        throw error;
      }
      return { outcome: "inserted" as const, id: data.id as string };
    },

    async deleteClaim(id) {
      const { error } = await supabase.from("demo_usage").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

/** Persist generation output on the claim row (logged, non-throwing). */
export async function saveDemoResult(
  claimId: string,
  fields: {
    result: unknown;
    state: string | null;
    lotSize: number;
    budget: number;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
): Promise<void> {
  const { error } = await admin()
    .from("demo_usage")
    .update({
      result: fields.result,
      state: fields.state,
      lot_size: fields.lotSize,
      budget: fields.budget,
      model: fields.model,
      input_tokens: fields.inputTokens,
      output_tokens: fields.outputTokens,
    })
    .eq("id", claimId);
  if (error) console.error("[demo-guard] saveDemoResult failed:", error);
}

/** Release a claim after a failed generation so the visitor can retry. */
export async function releaseDemoClaim(claimId: string): Promise<void> {
  try {
    await createSupabaseDemoStore().deleteClaim(claimId);
  } catch (error) {
    // Stale-claim TTL in checkAndClaimDemo recovers this case eventually.
    console.error("[demo-guard] releaseDemoClaim failed:", error);
  }
}
