// Observability record layer (W0 cost + W4 errors) — ONE shared wiring.
//
// Background: the app's daily Claude cron群 consume the app ANTHROPIC_API_KEY
// (prepaid metered). That spend was invisible — no DB table recorded it, so a
// runaway loop could burn the prepaid balance unnoticed (7/3: $11.47/day). This
// module closes that hole WITHOUT adding any new metered call: it only records
// what already happened.
//
//   • trackedMessage() — thin wrapper around anthropic.messages.create() that,
//     AFTER the call returns, estimates $ from usage tokens and writes one row to
//     cron_costs. Every Claude cron routes through this one helper so recording
//     is not scattered.
//   • recordError() — writes one row to error_events from a cron/API catch block.
//   • get{Cost,Error}Summary() — read helpers for the daily brief (cost / error
//     sections + spike alerts), built on PURE summarizers that are unit-tested
//     without any DB / API / LINE.
//
// Every writer NEVER throws: monitoring must not break the job it monitors
// (same contract as src/lib/heartbeat.ts). Failures are console.error'd.
//
// COST DECLARATION: this module adds $0/day of metered spend. It makes no Claude
// or external paid API call — trackedMessage forwards the caller's existing call
// and only reads its response; every other function talks to Supabase (already
// in use, unmetered). See anthropic-pricing.ts for the estimation table.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "./anthropic-pricing";

// ── Service-role client (same pattern as heartbeat.ts). Returns null when env is
// missing so callers degrade to "record skipped" instead of throwing. ──────────
function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─────────────────────────────────────────────────────────────────────────────
// W0 — Cost recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record one Claude call's estimated cost into cron_costs. NEVER throws.
 * `usage` is the `.usage` field of an Anthropic Message (input/output tokens).
 */
export async function recordClaudeCost(
  job: string,
  model: string,
  usage: Anthropic.Usage | null | undefined,
): Promise<void> {
  try {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const est = estimateCostUsd(model, inputTokens, outputTokens);
    const supabase = serviceClient();
    if (!supabase) {
      console.error(`[cost] ${job}: missing Supabase env — cannot record`);
      return;
    }
    const { error } = await supabase.from("cron_costs").insert({
      job,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      est_cost_usd: est,
    });
    if (error) console.error(`[cost] ${job}: insert failed: ${error.message}`);
  } catch (err) {
    console.error(`[cost] ${job}:`, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Wrap anthropic.messages.create(): run the caller's existing call unchanged,
 * then record its cost. The Claude response is returned untouched. Cost recording
 * is best-effort and never affects the call's result or throws.
 *
 * Adds NO new metered spend — it forwards the same call the cron already made.
 */
export async function trackedMessage(
  job: string,
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const msg = await client.messages.create(params);
  await recordClaudeCost(job, String(params.model), msg.usage);
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// W4 — Error recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a runtime error (5xx / uncaught) into error_events. NEVER throws.
 * Keep `route` a stable short id (e.g. "cron/daily-brief") for Top-N grouping.
 */
export async function recordError(
  route: string,
  status: number,
  message: string,
  stack?: string | null,
): Promise<void> {
  try {
    const supabase = serviceClient();
    if (!supabase) {
      console.error(`[error] ${route}: missing Supabase env — cannot record`);
      return;
    }
    const { error } = await supabase.from("error_events").insert({
      route,
      status,
      message: (message ?? "").slice(0, 2000),
      stack: stack ? stack.slice(0, 4000) : null,
    });
    if (error) console.error(`[error] ${route}: insert failed: ${error.message}`);
  } catch (err) {
    console.error(`[error] ${route}:`, err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure summarizers (unit-tested; no DB / API / LINE)
// ─────────────────────────────────────────────────────────────────────────────

export interface CostRow {
  job: string;
  est_cost_usd: number | string | null;
  created_at: string;
}

export interface CostSummaryOptions {
  now: Date;
  /** MTD spend above this (USD) raises a warning. */
  mtdWarnUsd: number;
  /** Ignore day-over-day spikes when the prior day is below this floor (noise). */
  spikeFloorUsd: number;
  /** yesterday > multiplier × dayBefore raises a spike warning. */
  spikeMultiplier: number;
}

export interface CostSummary {
  mtdUsd: number;
  yesterdayUsd: number;
  dayBeforeUsd: number;
  topJobs: Array<{ job: string; usd: number }>;
  /** Human-readable warning lines (empty when healthy). */
  warnings: string[];
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregate cron_costs rows into month-to-date + day-over-day figures and derive
 * threshold warnings. Rows may include the whole current UTC month; anything
 * before the 1st (UTC) is ignored for MTD. Pure — safe to unit test.
 */
export function summarizeCosts(rows: CostRow[], opts: CostSummaryOptions): CostSummary {
  const { now, mtdWarnUsd, spikeFloorUsd, spikeMultiplier } = opts;
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const yesterdayKey = utcDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const dayBeforeKey = utcDateKey(new Date(now.getTime() - 48 * 60 * 60 * 1000));

  let mtdUsd = 0;
  let yesterdayUsd = 0;
  let dayBeforeUsd = 0;
  const byJob = new Map<string, number>();

  for (const r of rows) {
    const ts = new Date(r.created_at);
    if (isNaN(ts.getTime()) || ts.getTime() < monthStartMs) continue;
    const usd = toNum(r.est_cost_usd);
    mtdUsd += usd;
    byJob.set(r.job, (byJob.get(r.job) ?? 0) + usd);
    const key = utcDateKey(ts);
    if (key === yesterdayKey) yesterdayUsd += usd;
    else if (key === dayBeforeKey) dayBeforeUsd += usd;
  }

  const topJobs = [...byJob.entries()]
    .map(([job, usd]) => ({ job, usd: round2(usd) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 3);

  const warnings: string[] = [];
  if (mtdUsd > mtdWarnUsd) {
    warnings.push(`MTD $${round2(mtdUsd)} > 閾値 $${mtdWarnUsd}`);
  }
  if (dayBeforeUsd >= spikeFloorUsd && yesterdayUsd > spikeMultiplier * dayBeforeUsd) {
    warnings.push(`前日 $${round2(yesterdayUsd)} が前々日 $${round2(dayBeforeUsd)} の${spikeMultiplier}倍超`);
  }

  return {
    mtdUsd: round2(mtdUsd),
    yesterdayUsd: round2(yesterdayUsd),
    dayBeforeUsd: round2(dayBeforeUsd),
    topJobs,
    warnings,
  };
}

export interface ErrorRow {
  route: string;
}

export interface ErrorSummaryOptions {
  /** ≥ this many errors in the window raises a warning. */
  warnCount: number;
}

export interface ErrorSummary {
  count: number;
  topRoutes: Array<{ route: string; n: number }>;
  warnings: string[];
}

/** Aggregate error_events rows (already windowed) into count + Top-3 routes. Pure. */
export function summarizeErrors(rows: ErrorRow[], opts: ErrorSummaryOptions): ErrorSummary {
  const byRoute = new Map<string, number>();
  for (const r of rows) byRoute.set(r.route, (byRoute.get(r.route) ?? 0) + 1);
  const topRoutes = [...byRoute.entries()]
    .map(([route, n]) => ({ route, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const count = rows.length;
  const warnings: string[] = [];
  if (count >= opts.warnCount) warnings.push(`直近24hで ${count}件のエラー`);
  return { count, topRoutes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed read helpers for the daily brief (best-effort; never throw)
// ─────────────────────────────────────────────────────────────────────────────

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface DailyCostSection extends CostSummary {
  /** api_usage_external request_count sum for the current UTC month. */
  externalCount: number;
  /** Apollo credit balance is not queryable here without adding a meter. */
  apolloCredits: string;
}

/**
 * Read cron_costs (current UTC month) + api_usage_external for the daily brief.
 * Thresholds come from env (defaults are conservative; unset env never throws):
 *   CRON_COST_MTD_WARN_USD (default 50), CRON_COST_SPIKE_FLOOR_USD (default 0.5),
 *   CRON_COST_SPIKE_MULT (default 2).
 */
export async function getCostSummary(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<DailyCostSection> {
  const empty: DailyCostSection = {
    mtdUsd: 0, yesterdayUsd: 0, dayBeforeUsd: 0, topJobs: [], warnings: [],
    externalCount: 0, apolloCredits: "n/a（手動確認）",
  };
  try {
    const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthKey = monthStartIso.slice(0, 7); // YYYY-MM

    const [costsRes, extRes] = await Promise.all([
      supabase.from("cron_costs").select("job, est_cost_usd, created_at").gte("created_at", monthStartIso),
      supabase.from("api_usage_external").select("request_count").eq("month", monthKey),
    ]);

    const rows = (costsRes.data ?? []) as CostRow[];
    const summary = summarizeCosts(rows, {
      now,
      mtdWarnUsd: envNum("CRON_COST_MTD_WARN_USD", 50),
      spikeFloorUsd: envNum("CRON_COST_SPIKE_FLOOR_USD", 0.5),
      spikeMultiplier: envNum("CRON_COST_SPIKE_MULT", 2),
    });
    const externalCount = ((extRes.data ?? []) as Array<{ request_count: number | null }>)
      .reduce((sum, r) => sum + (r.request_count ?? 0), 0);

    return { ...summary, externalCount, apolloCredits: "n/a（手動確認）" };
  } catch (err) {
    console.error("[cost] getCostSummary failed:", err instanceof Error ? err.message : String(err));
    return empty;
  }
}

/**
 * Read error_events for the last `windowHours` (default 24) for the daily brief.
 * Threshold ERROR_WARN_24H (default 5) — unset env never throws.
 */
export async function getErrorSummary(
  supabase: SupabaseClient,
  now: Date = new Date(),
  windowHours = 24,
): Promise<ErrorSummary> {
  try {
    const sinceIso = new Date(now.getTime() - windowHours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("error_events").select("route").gte("occurred_at", sinceIso);
    return summarizeErrors((data ?? []) as ErrorRow[], { warnCount: envNum("ERROR_WARN_24H", 5) });
  } catch (err) {
    console.error("[error] getErrorSummary failed:", err instanceof Error ? err.message : String(err));
    return { count: 0, topRoutes: [], warnings: [] };
  }
}
