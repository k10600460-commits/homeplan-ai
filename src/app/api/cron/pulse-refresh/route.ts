import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordHeartbeat, recordHeartbeatFromResponse } from "@/lib/heartbeat";
import { getMortgageRate } from "@/lib/mortgage-rate";
import { PULSE_METROS } from "@/data/pulse-metros";
import type {
  MetroAggregates,
  MetroPermitStats,
  PulseMetroSnapshot,
  PulseRate,
} from "@/lib/pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// P-A Builder Market Pulse — weekly snapshot cron (Thursdays 18:00 UTC, after
// the Freddie Mac PMMS release lands in FRED). Writes ONE pulse_snapshots row;
// /pulse pages only ever render from these rows (never live-fetch).
//
// FAIL-LOUD (silent-zero ban, same contract as content-feedback):
//   - Any source failure still upserts the row (status='partial'/'failed',
//     per-metro nulls, error text) and this route returns 500 so the Vercel
//     cron run is visibly red + the pulse-refresh heartbeat records the error.
//   - The PMMS fallback constant (source!=='fred') is NEVER stored: a made-up
//     6.5% on a public data page would violate the fabrication-zero policy.
//     Pages render "updating" instead.

const FRED_OBS_URL = "https://api.stlouisfed.org/fred/series/observations";
const TRAILING_MONTHS = 12;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Source: Census BPS single-family permits via FRED ────────────────────────
async function fetchMetroPermits(seriesId: string): Promise<MetroPermitStats> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("missing env FRED_API_KEY");

  const url =
    `${FRED_OBS_URL}?series_id=${seriesId}&api_key=${apiKey}` +
    `&sort_order=desc&limit=${TRAILING_MONTHS}&file_type=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);

  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };
  const obs = (data.observations ?? []).filter((o) => o.value !== ".");
  if (obs.length < TRAILING_MONTHS) {
    // Publishing a "12-month" total built from fewer months would be a made-up
    // stat — fail this metro loudly instead (page shows n/a).
    throw new Error(`FRED ${seriesId}: only ${obs.length}/${TRAILING_MONTHS} usable observations`);
  }

  const values = obs.map((o) => Number.parseFloat(o.value));
  if (values.some((v) => !Number.isFinite(v))) {
    throw new Error(`FRED ${seriesId}: non-numeric observation`);
  }

  return {
    seriesId,
    latestMonth: obs[0].date,
    latestMonthUnits: values[0],
    trailing12moUnits: values.reduce((a, b) => a + b, 0),
  };
}

// ── Source: SplanAI anonymized per-metro aggregates ───────────────────────────
// Honest stub, on purpose: plan_generations and demo_usage carry no metro
// attribution today (demo_usage stores a state code, and a state is not a
// metro), so there is nothing that can be truthfully aggregated per metro.
// When metro capture lands in those tables, compute {n, generations, topStyle}
// here — the n >= 10 publication gate already exists in the page renderer
// (publishableAggregates), so no display change is needed.
async function computeMetroAggregates(): Promise<Record<string, MetroAggregates | null>> {
  const out: Record<string, MetroAggregates | null> = {};
  for (const m of PULSE_METROS) out[m.slug] = null;
  return out;
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function pulseRefreshHandler(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const errors: string[] = [];

  // 1) Rate — reuse the exact lib behind /api/mortgage-rate.
  let rate: PulseRate | null = null;
  try {
    const r = await getMortgageRate();
    if (r.source !== "fred") {
      throw new Error("mortgage rate came from fallback constant, refusing to publish");
    }
    rate = { pct: r.rate, asOf: r.asOf, seriesId: "MORTGAGE30US", source: "fred" };
  } catch (e) {
    errors.push(`rate: ${toErrorMessage(e)}`);
  }

  // 2) Permits per metro (independent failures; sequential keeps FRED happy).
  const permitsBySlug: Record<string, MetroPermitStats | null> = {};
  for (const metro of PULSE_METROS) {
    try {
      permitsBySlug[metro.slug] = await fetchMetroPermits(metro.fredPermitsSeriesId);
    } catch (e) {
      permitsBySlug[metro.slug] = null;
      errors.push(`permits:${metro.slug}: ${toErrorMessage(e)}`);
    }
  }

  // 3) SplanAI aggregates (currently all null — see computeMetroAggregates).
  const aggregatesBySlug = await computeMetroAggregates();

  const metros: Record<string, PulseMetroSnapshot> = {};
  for (const metro of PULSE_METROS) {
    metros[metro.slug] = {
      permits: permitsBySlug[metro.slug],
      aggregates: aggregatesBySlug[metro.slug],
    };
  }

  const everythingFailed = rate === null && PULSE_METROS.every((m) => !permitsBySlug[m.slug]);
  const status = errors.length === 0 ? "complete" : everythingFailed ? "failed" : "partial";
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const { error: upsertError } = await supabase.from("pulse_snapshots").upsert(
    {
      snapshot_date: snapshotDate,
      status,
      rate,
      metros,
      error: errors.length > 0 ? errors.join(" | ") : null,
    },
    { onConflict: "snapshot_date" },
  );

  if (upsertError) {
    console.error("[pulse-refresh] upsert failed:", upsertError.message);
    return NextResponse.json(
      { ok: false, snapshot_date: snapshotDate, error: `upsert failed: ${upsertError.message}` },
      { status: 500 },
    );
  }

  if (errors.length > 0) {
    console.error("[pulse-refresh] recorded", status, "row:", errors.join(" | "));
    return NextResponse.json(
      { ok: false, snapshot_date: snapshotDate, status, error: errors.join(" | ") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: snapshotDate,
    status,
    rate_as_of: rate?.asOf,
    metros_with_permits: PULSE_METROS.filter((m) => permitsBySlug[m.slug]).length,
  });
}

// R5 cron heartbeat — thin wrapper only (same pattern as content-feedback).
export async function GET(req: NextRequest) {
  try {
    const res = await pulseRefreshHandler(req);
    await recordHeartbeatFromResponse("pulse-refresh", res);
    return res;
  } catch (err) {
    await recordHeartbeat("pulse-refresh", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
