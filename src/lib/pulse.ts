// Shared logic for /pulse (P-A Builder Market Pulse).
//
// Data flow: /api/cron/pulse-refresh (weekly) writes ONE row per run into
// pulse_snapshots; pages read the latest row here (getLatestPulseSnapshot)
// and render "updating" placeholders when it is missing. Pages never call
// FRED directly — every displayed figure went through the cron and carries
// a source + as-of date. Unsourced values render "n/a" (fabrication-zero).
//
// Server-only concerns (Supabase service-role read) are confined to
// getLatestPulseSnapshot; everything else is pure and unit-tested in
// src/lib/pulse.test.ts (word-count contract for GEO passages included).

import { createClient } from "@supabase/supabase-js";
import { calcMonthly } from "@/lib/price-calculator";
import { PULSE_METRO_SLUGS, type PulseMetro } from "@/data/pulse-metros";

// ── Payment table constants (rendered on every pulse page) ───────────────────
export const PULSE_PRICE_POINTS = [
  300_000, 400_000, 500_000, 600_000, 700_000, 800_000,
] as const;
export const PULSE_DOWN_PCT = 20;
export const PULSE_TERM_YEARS = 30;

/** SplanAI self-reported aggregates are only published at n >= this floor. */
export const PULSE_AGG_MIN_N = 10;

// ── Snapshot types (shape of pulse_snapshots rows) ───────────────────────────
export interface PulseRate {
  /** 30-yr fixed average, percent (e.g. 6.72) */
  pct: number;
  /** Observation date of the PMMS reading, ISO "YYYY-MM-DD" */
  asOf: string;
  seriesId: "MORTGAGE30US";
  source: "fred";
}

export interface MetroPermitStats {
  seriesId: string;
  /** ISO date of the latest monthly observation, e.g. "2026-05-01" */
  latestMonth: string;
  /** Single-family (1-unit) housing units authorized in the latest month */
  latestMonthUnits: number;
  /** Sum of the latest 12 monthly observations */
  trailing12moUnits: number;
}

/**
 * SplanAI's own anonymized generation stats for a metro. Currently always
 * null in snapshots: plan_generations / demo_usage carry no metro attribution
 * (demo_usage stores state only, which is not a metro), so per the
 * fabrication-zero policy nothing is published and pages render the section
 * as "coming soon". The n >= PULSE_AGG_MIN_N gate below is already wired so
 * data flows through unchanged once metro capture lands.
 */
export interface MetroAggregates {
  /** Sample size — rendered as "based on N samples" */
  n: number;
  generations: number;
  /** Most common concept style direction in the sample, if any */
  topStyle: string | null;
}

export interface PulseMetroSnapshot {
  permits: MetroPermitStats | null;
  aggregates: MetroAggregates | null;
}

export interface PulseSnapshot {
  snapshotDate: string; // ISO "YYYY-MM-DD"
  status: "complete" | "partial" | "failed";
  rate: PulseRate | null;
  metros: Record<string, PulseMetroSnapshot>;
  error: string | null;
}

/** Aggregates pass the publication gate only at n >= PULSE_AGG_MIN_N. */
export function publishableAggregates(
  agg: MetroAggregates | null | undefined,
): MetroAggregates | null {
  if (!agg || typeof agg.n !== "number" || agg.n < PULSE_AGG_MIN_N) return null;
  return agg;
}

// ── Payment table ─────────────────────────────────────────────────────────────
export interface PaymentRow {
  price: number;
  downPayment: number;
  loanAmount: number;
  /** Monthly principal & interest, USD (rounded) */
  monthly: number;
}

/** Reuses calcMonthly from the existing price-calculator (P&I only). */
export function buildPaymentRows(ratePct: number): PaymentRow[] {
  return PULSE_PRICE_POINTS.map((price) => ({
    price,
    downPayment: Math.round((price * PULSE_DOWN_PCT) / 100),
    loanAmount: Math.round((price * (100 - PULSE_DOWN_PCT)) / 100),
    monthly: calcMonthly(price, PULSE_DOWN_PCT, ratePct, PULSE_TERM_YEARS),
  }));
}

// ── Snapshot read (server-only path; never throws) ───────────────────────────
export async function getLatestPulseSnapshot(): Promise<PulseSnapshot | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("pulse_snapshots")
      .select("snapshot_date, status, rate, metros, error")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[pulse] snapshot read failed:", error.message);
      return null;
    }
    return {
      snapshotDate: data.snapshot_date as string,
      status: data.status as PulseSnapshot["status"],
      rate: (data.rate as PulseRate | null) ?? null,
      metros: (data.metros as Record<string, PulseMetroSnapshot>) ?? {},
      error: (data.error as string | null) ?? null,
    };
  } catch (err) {
    // Build with dummy env / transient outage → pages show "updating".
    console.error("[pulse] snapshot read threw:", err);
    return null;
  }
}

// ── Unsubscribe token (shared by /api/cron/pulse-digest + /api/pulse/unsubscribe)
// Token = crypto.signPayload({ email, purpose }) — an HMAC-SHA256-signed payload
// bound to the subscriber email. Stateless: no DB column needed; deleting the
// pulse_subscribers row IS the unsubscribe.
export const PULSE_UNSUB_TOKEN_PURPOSE = "pulse-unsub";

// ── Subscription validation (POST /api/pulse/subscribe) ──────────────────────
// Same strict shape as emails.ts SAFE_EMAIL_RE.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EMAIL_MAX_LEN = 254;

export type SubscriptionInput =
  | { ok: true; email: string; metro: string | null }
  | { ok: false; error: string };

/**
 * Normalizes {email, metro} from an untrusted request body.
 * metro: must be a known pulse metro slug; ""/"all"/undefined/null → null
 * (= all-metros digest). Unknown slugs are rejected, not silently dropped.
 */
export function normalizePulseSubscription(body: unknown): SubscriptionInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.email !== "string") return { ok: false, error: "invalid_email" };
  const email = raw.email.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LEN || !EMAIL_RE.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  let metro: string | null = null;
  if (raw.metro !== undefined && raw.metro !== null) {
    if (typeof raw.metro !== "string") return { ok: false, error: "invalid_metro" };
    const slug = raw.metro.trim().toLowerCase();
    if (slug === "" || slug === "all") {
      metro = null;
    } else if (PULSE_METRO_SLUGS.includes(slug)) {
      metro = slug;
    } else {
      return { ok: false, error: "invalid_metro" };
    }
  }

  return { ok: true, email, metro };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "2026-05-01" → "May 2026" (UTC-safe; observation dates are month starts). */
export function fmtMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  if (!y || !m) return isoDate;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-06-26" → "June 26, 2026" */
export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── GEO citation passage (134–167 words, enforced by pulse.test.ts) ──────────
/** Counts words as whitespace-separated tokens containing a letter or digit. */
export function countPassageWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

/**
 * The quotable summary paragraph rendered near the top of each pulse page.
 * Assertive, sourced, and template-stable so AI search engines can lift it
 * verbatim. metro = null → hub passage.
 */
export function buildPulseGeoPassage(metro: PulseMetro | null): string {
  if (!metro) {
    return (
      "SplanAI Builder Market Pulse is a free weekly data hub for small and mid-size US home builders, " +
      "the owner-operator firms building roughly 10 to 50 homes a year. It tracks the two numbers that " +
      "shape every pre-sale conversation: the 30-year fixed mortgage rate, taken from Freddie Mac's " +
      "Primary Mortgage Market Survey as published through FRED (series MORTGAGE30US), and single-family " +
      "building-permit activity in ten builder-heavy metros, Raleigh, Nashville, Austin, Dallas–Fort Worth, " +
      "Charlotte, Boise, Phoenix, Atlanta, Tampa, and Jacksonville, from the U.S. Census Bureau Building " +
      "Permits Survey via FRED. Each metro page turns the current rate into a monthly-payment table for " +
      "homes priced $300,000 to $800,000 with 20% down. Every figure names its source and as-of date, " +
      "updates weekly, and anything we cannot source is marked n/a rather than estimated. Anonymized " +
      "SplanAI demand data appears only once a metro reaches at least ten samples, labeled with the " +
      "sample count."
    );
  }
  return (
    `SplanAI Builder Market Pulse for ${metro.name}, ${metro.stateCode} is a free weekly data page for ` +
    `small and mid-size home builders working in the ${metro.msaName} metro area. It answers two questions ` +
    "builders hear from buyers every week: what a monthly payment looks like at today's rate, and how busy " +
    "local single-family construction actually is. The payment table uses the 30-year fixed average from " +
    "Freddie Mac's Primary Mortgage Market Survey, published through FRED as series MORTGAGE30US, applied " +
    "to home prices from $300,000 to $800,000 with 20% down. Local permit activity comes from the U.S. " +
    `Census Bureau Building Permits Survey, via FRED series ${metro.fredPermitsSeriesId}, which counts ` +
    "single-family (1-unit) housing units authorized in the metro each month. Every figure carries its " +
    "source and as-of date, refreshes weekly, and anything we cannot source is shown as n/a instead of an " +
    "estimate. SplanAI adds anonymized buyer-demand data for a metro only once it reaches at least ten " +
    "samples, always labeled with the sample count."
  );
}
