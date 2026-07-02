import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pushMessages } from "@/lib/line";
import { recordHeartbeat } from "@/lib/heartbeat";
import { isDemoSlug } from "@/lib/demo-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase R (R3) — hot-lead instant alert: "know 'Dean opened 4×' the same day".
// Every 15 min (vercel.json), detect link_events rows (event_type='view' — the
// server-side per-page-load open event from /s/[slug]) newer than the
// alert_state watermark and LINE-push builder/lead name + cumulative opens.
//
// Suppression: max ONE push per shared_link per hour (alert_state.meta.last_alerts).
// Suppressed opens are consumed by the watermark on purpose — the next open
// after the hour re-alerts with the cumulative count, so nothing is lost.
//
// FAIL-LOUD: on any failure the watermark is NOT advanced (events re-alert on
// the next run), a heartbeat failure is recorded, a best-effort LINE error
// notice is attempted, and the route returns 500 so the Vercel cron run is red.
const JOB = "hot-lead-alert";
const OPEN_EVENT_TYPE = "view";
const SUPPRESS_MS = 60 * 60 * 1000; // 1 push per shared_link per hour
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000; // no state row yet → scan last hour only
const PRUNE_MS = 24 * 60 * 60 * 1000; // drop suppression stamps older than 24h
const EVENT_CAP = 1000; // PostgREST row cap; if hit, watermark stops at the last row

type LinkRow = { id: string; slug: string; client_name: string | null; builder_name: string | null };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Best-effort growth-CRM enrichment: shared_link → growth_generated_proposals →
// growth_companies.name, so the alert says WHICH prospect opened. A failure here
// must never block the alert itself (core detection/push stays fail-loud).
async function fetchCompanyNames(
  supabase: SupabaseClient,
  linkIds: string[],
): Promise<Map<string, string>> {
  const byLink = new Map<string, string>();
  try {
    const { data: proposals, error: propError } = await supabase
      .from("growth_generated_proposals")
      .select("shared_link_id, company_id")
      .in("shared_link_id", linkIds);
    if (propError) throw new Error(propError.message);

    const rows = (proposals ?? []) as Array<{ shared_link_id: string | null; company_id: string | null }>;
    const companyIds = [...new Set(rows.map(r => r.company_id).filter((v): v is string => !!v))];
    if (companyIds.length === 0) return byLink;

    const { data: companies, error: compError } = await supabase
      .from("growth_companies")
      .select("id, name")
      .in("id", companyIds);
    if (compError) throw new Error(compError.message);

    const nameById = new Map(
      ((companies ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]),
    );
    for (const r of rows) {
      if (r.shared_link_id && r.company_id && nameById.has(r.company_id)) {
        byLink.set(r.shared_link_id, nameById.get(r.company_id)!);
      }
    }
  } catch (err) {
    console.error("[hot-lead-alert] growth enrichment failed (alert continues):", toErrorMessage(err));
  }
  return byLink;
}

async function runAlert(supabase: SupabaseClient) {
  const runStart = new Date();
  const runStartIso = runStart.toISOString();

  // 1. Watermark + per-link suppression stamps
  const { data: state, error: stateError } = await supabase
    .from("alert_state")
    .select("last_checked, meta")
    .eq("key", JOB)
    .maybeSingle();
  if (stateError) throw new Error(`alert_state read failed: ${stateError.message}`);

  const lastChecked =
    (state?.last_checked as string | null) ??
    new Date(runStart.getTime() - FIRST_RUN_LOOKBACK_MS).toISOString();
  const meta = (state?.meta ?? {}) as { last_alerts?: Record<string, string> };
  const lastAlerts: Record<string, string> = { ...(meta.last_alerts ?? {}) };

  // 2. New portal opens in (lastChecked, runStart]
  const { data: events, error: eventsError } = await supabase
    .from("link_events")
    .select("link_id, created_at")
    .eq("event_type", OPEN_EVENT_TYPE)
    .gt("created_at", lastChecked)
    .lte("created_at", runStartIso)
    .order("created_at", { ascending: true })
    .limit(EVENT_CAP);
  if (eventsError) throw new Error(`link_events read failed: ${eventsError.message}`);

  const eventRows = (events ?? []) as Array<{ link_id: string; created_at: string }>;
  // If the cap was hit, only advance to the last processed row so the remainder
  // is picked up next run instead of being silently skipped.
  const nextWatermark =
    eventRows.length === EVENT_CAP ? eventRows[eventRows.length - 1].created_at : runStartIso;

  const saveState = async () => {
    const { error } = await supabase.from("alert_state").upsert(
      { key: JOB, last_checked: nextWatermark, meta: { last_alerts: lastAlerts }, updated_at: runStartIso },
      { onConflict: "key" },
    );
    if (error) throw new Error(`alert_state write failed: ${error.message}`);
  };

  const newOpensByLink = new Map<string, number>();
  for (const e of eventRows) {
    newOpensByLink.set(e.link_id, (newOpensByLink.get(e.link_id) ?? 0) + 1);
  }

  if (newOpensByLink.size === 0) {
    await saveState();
    return { new_opens: 0, alerted: 0, suppressed: 0 };
  }

  // 3. Link metadata; drop demo portals (founder self-views must never alert)
  const linkIds = [...newOpensByLink.keys()];
  const { data: links, error: linksError } = await supabase
    .from("shared_links")
    .select("id, slug, client_name, builder_name")
    .in("id", linkIds);
  if (linksError) throw new Error(`shared_links read failed: ${linksError.message}`);

  const realLinks = ((links ?? []) as LinkRow[]).filter(l => !isDemoSlug(l.slug));

  // 4. Suppression: one push per link per hour
  const suppressCutoff = runStart.getTime() - SUPPRESS_MS;
  const alertable = realLinks.filter(l => {
    const last = lastAlerts[l.id];
    return !last || new Date(last).getTime() <= suppressCutoff;
  });
  const suppressed = realLinks.length - alertable.length;

  if (alertable.length === 0) {
    await saveState();
    return { new_opens: eventRows.length, alerted: 0, suppressed };
  }

  // 5. Cumulative opens per alertable link (all-time 'view' count)
  const totals = await Promise.all(
    alertable.map(async (l): Promise<[string, number]> => {
      const { count, error } = await supabase
        .from("link_events")
        .select("id", { count: "exact", head: true })
        .eq("link_id", l.id)
        .eq("event_type", OPEN_EVENT_TYPE);
      if (error) throw new Error(`open-count failed for link ${l.id}: ${error.message}`);
      return [l.id, count ?? 0];
    }),
  );
  const totalByLink = new Map(totals);

  // 6. Growth CRM prospect names (best-effort)
  const companyByLink = await fetchCompanyNames(supabase, alertable.map(l => l.id));

  // 7. One LINE text message covering every alertable link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
  const blocks = alertable.map(l => {
    const label = l.client_name?.trim() || l.builder_name?.trim() || l.slug;
    const company = companyByLink.get(l.id);
    const fresh = newOpensByLink.get(l.id) ?? 0;
    const total = totalByLink.get(l.id) ?? fresh;
    return `${label}${company ? `（${company}）` : ""}\n累計${total}回開封（新規+${fresh}）\n${appUrl}/s/${l.slug}`;
  });
  const text = `🔥 ポータル開封アラート\n\n${blocks.join("\n\n")}`.slice(0, 4900);

  const line = await pushMessages([{ type: "text", text }]);
  if (!line.ok) {
    // Watermark NOT advanced: these opens re-alert next run (no silent loss).
    throw new Error(`LINE push failed (${line.status}): ${line.body.slice(0, 200)}`);
  }

  // 8. Persist watermark + suppression stamps (pruned so meta stays small)
  for (const l of alertable) lastAlerts[l.id] = runStartIso;
  const pruneCutoff = runStart.getTime() - PRUNE_MS;
  for (const [k, v] of Object.entries(lastAlerts)) {
    if (new Date(v).getTime() < pruneCutoff) delete lastAlerts[k];
  }
  await saveState();

  return { new_opens: eventRows.length, alerted: alertable.length, suppressed };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordHeartbeat(JOB, { ok: false, error: "missing Supabase env" });
    return NextResponse.json(
      { ok: false, error: "missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  try {
    const result = await runAlert(supabase);
    await recordHeartbeat(JOB, { ok: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = toErrorMessage(err);
    console.error("[hot-lead-alert] FAILED:", message);
    // Fail-loud: every failure is a red cron run + log line + heartbeat
    // last_error (listed in the daily-brief Cron health section). The LINE
    // error notice fires on the FIRST failure only (previous heartbeat had no
    // last_error) so a persistent breakage doesn't push every 15 minutes.
    let alreadyFailing = false;
    try {
      const { data: hb } = await supabase
        .from("cron_heartbeats")
        .select("last_error")
        .eq("job", JOB)
        .maybeSingle();
      alreadyFailing = !!hb?.last_error;
    } catch {
      // heartbeat table unreadable — treat as first failure (stay loud)
    }
    await recordHeartbeat(JOB, { ok: false, error: message });
    if (!alreadyFailing) {
      // Best-effort — if LINE itself is the failure this cannot deliver, but
      // the heartbeat + 500 + daily-brief health line remain.
      await pushMessages([{ type: "text", text: `⚠ hot-lead-alert 失敗\n${message.slice(0, 300)}` }]);
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
