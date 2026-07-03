// Cron heartbeat recorder (Phase R / R5) — one row per job in cron_heartbeats.
//   ok      → last_ok = now, last_error = null
//   ok+warn → last_ok = now, last_error = "WARN <msg>" (W1 link integrity):
//             the job SUCCEEDED but skipped work on purpose (e.g. a draft whose
//             blog link is not published yet). last_ok stays fresh so staleness
//             monitoring is untouched; the WARN prefix keeps it visually
//             distinct from a real failure in the daily brief. Cleared by the
//             next warning-free success.
//   failure → last_error = message (last_ok is intentionally preserved so
//             "stale last_ok" and "recent error" remain independent signals)
// NEVER throws: monitoring must not break the job it monitors. Recording
// failures are console.error'd (visible in Vercel logs) instead of silent.

import { createClient } from "@supabase/supabase-js";

export type HeartbeatResult =
  | { ok: true; warn?: string }
  | { ok: false; error: string };

export const HEARTBEAT_WARN_PREFIX = "WARN ";

// Split a cron_heartbeats.last_error value into severity + message.
// last_error carries BOTH real failures and "WARN "-prefixed intentional holds
// (see recordHeartbeat) — every consumer MUST classify through this helper
// (codex review): a bare `last_error IS NOT NULL` check would misread an
// intentional link-integrity hold as a job failure.
export function parseHeartbeatIssue(
  lastError: string,
): { level: "warn" | "error"; message: string } {
  return lastError.startsWith(HEARTBEAT_WARN_PREFIX)
    ? { level: "warn", message: lastError.slice(HEARTBEAT_WARN_PREFIX.length) }
    : { level: "error", message: lastError };
}

export async function recordHeartbeat(job: string, result: HeartbeatResult): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error(`[heartbeat] ${job}: missing Supabase env — cannot record`);
      return;
    }
    const supabase = createClient(url, key);
    const now = new Date().toISOString();
    // Single (non-union) row type so supabase-js generics accept it. On failure
    // last_ok is OMITTED — the upsert then leaves the previous last_ok in place.
    const row: { job: string; last_ok?: string; last_error: string | null; updated_at: string } =
      result.ok
        ? {
            job,
            last_ok: now,
            last_error: result.warn
              ? `${HEARTBEAT_WARN_PREFIX}${result.warn}`.slice(0, 1000)
              : null,
            updated_at: now,
          }
        : { job, last_error: result.error.slice(0, 1000), updated_at: now };
    const { error } = await supabase.from("cron_heartbeats").upsert(row, { onConflict: "job" });
    if (error) console.error(`[heartbeat] ${job}: upsert failed: ${error.message}`);
  } catch (err) {
    console.error(`[heartbeat] ${job}:`, err instanceof Error ? err.message : String(err));
  }
}

// Record a heartbeat from a route Response: <400 → ok, >=500 → failure with a
// body excerpt. 4xx is ignored on purpose — unauthorized probes of /api/cron/*
// must not pollute last_error (a misconfigured CRON_SECRET still surfaces via
// last_ok going stale).
// A 2xx JSON body may carry a top-level `warn: string` (set by x-post/fb-post
// when the link-integrity gate skipped drafts) — recorded as ok+warn.
export async function recordHeartbeatFromResponse(job: string, res: Response): Promise<void> {
  if (res.status < 400) {
    let warn: string | undefined;
    try {
      const body = (await res.clone().json()) as { warn?: unknown };
      if (typeof body?.warn === "string" && body.warn.trim()) warn = body.warn.slice(0, 500);
    } catch {
      // non-JSON success body — plain ok
    }
    await recordHeartbeat(job, warn ? { ok: true, warn } : { ok: true });
    return;
  }
  if (res.status < 500) return;
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.clone().text();
    if (body) detail += `: ${body.slice(0, 300)}`;
  } catch {
    // body unreadable — status alone is enough
  }
  await recordHeartbeat(job, { ok: false, error: detail });
}
