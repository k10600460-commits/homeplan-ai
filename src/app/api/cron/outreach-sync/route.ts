import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordHeartbeat } from "@/lib/heartbeat";
import { isDemoSlug } from "@/lib/demo-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase R (R2) — daily portal-open → outreach CRM sync (21:00 UTC = 06:00 JST,
// one hour before daily-brief so the brief reads fresh data).
//
// From link_events (event_type='view' — same 'view'-only semantics as the live
// computation in /api/growth/proposals) this job:
//   1. recomputes growth_generated_proposals.open_count / first_opened_at /
//      last_opened_at as ABSOLUTE all-time values (idempotent, no drift) and
//      upgrades status draft/sent → opened → engaged (never downgrades),
//   2. rolls the same stats up to the lead's growth_contacts row
//      (portal_opened_at / portal_last_opened_at / portal_open_count),
//   3. appends one growth_outreach_events row per new view (type='portal_open',
//      channel='portal', deduped by metadata.link_event_id + partial unique idx),
//   4. mirrors the rollup onto the legacy outreach_log row matched via
//      growth_companies.name (outreach_log rows are prospects, not events —
//      appending event rows there would corrupt the daily-brief KPI counts).
//
// FAIL-LOUD: any core failure throws → heartbeat failure + HTTP 500, and the
// watermark is NOT advanced, so the next run retries (all writes are idempotent:
// absolute recompute + event-id dedup). No silent skip.
const JOB = "outreach-sync";
const OPEN_EVENT_TYPE = "view";
const ENGAGED_EVENT_TYPES = ["pdf_download", "plan_selected", "prequal_click"];
const EVENT_CAP = 1000; // PostgREST row cap; if hit, watermark stops at the last row
const EPOCH = "1970-01-01T00:00:00Z"; // first run backfills full history
// (codex review) The scan window's upper bound trails "now" by this lag so an
// event whose INSERT committed slightly after our query can never fall behind
// an advanced watermark.
const SAFETY_LAG_MS = 30 * 1000;

const STATUS_RANK: Record<string, number> = { draft: 0, sent: 1, opened: 2, engaged: 3 };

type ProposalRow = {
  id: string;
  company_id: string | null;
  lead_id: string | null;
  shared_link_id: string;
  slug: string | null;
  status: string;
  first_opened_at: string | null;
  open_count: number;
  last_opened_at: string | null;
};

type LeadRow = { id: string; company_id: string; primary_contact_id: string | null };
type ContactRow = { id: string; company_id: string; is_primary: boolean };
type EventRow = { id: string; link_id: string; created_at: string };
type LinkStats = { open_count: number; first_opened_at: string | null; last_opened_at: string | null; engaged_count: number };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Absolute all-time stats for one link (same shape /api/growth/proposals derives
// live). Recomputing instead of incrementing keeps re-runs idempotent.
async function loadLinkStats(supabase: SupabaseClient, linkId: string): Promise<LinkStats> {
  const [countRes, firstRes, lastRes, engagedRes] = await Promise.all([
    supabase
      .from("link_events")
      .select("id", { count: "exact", head: true })
      .eq("link_id", linkId)
      .eq("event_type", OPEN_EVENT_TYPE),
    supabase
      .from("link_events")
      .select("created_at")
      .eq("link_id", linkId)
      .eq("event_type", OPEN_EVENT_TYPE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("link_events")
      .select("created_at")
      .eq("link_id", linkId)
      .eq("event_type", OPEN_EVENT_TYPE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("link_events")
      .select("id", { count: "exact", head: true })
      .eq("link_id", linkId)
      .in("event_type", ENGAGED_EVENT_TYPES),
  ]);

  const error = countRes.error ?? firstRes.error ?? lastRes.error ?? engagedRes.error;
  if (error) throw new Error(`link stats failed for ${linkId}: ${error.message}`);

  return {
    open_count: countRes.count ?? 0,
    first_opened_at: (firstRes.data as { created_at?: string } | null)?.created_at ?? null,
    last_opened_at: (lastRes.data as { created_at?: string } | null)?.created_at ?? null,
    engaged_count: engagedRes.count ?? 0,
  };
}

async function runSync(supabase: SupabaseClient) {
  const runStart = new Date();
  const runStartIso = runStart.toISOString();
  const windowEnd = new Date(runStart.getTime() - SAFETY_LAG_MS).toISOString();

  // 0. Watermark
  const { data: state, error: stateError } = await supabase
    .from("alert_state")
    .select("last_checked")
    .eq("key", JOB)
    .maybeSingle();
  if (stateError) throw new Error(`alert_state read failed: ${stateError.message}`);
  const lastChecked = (state?.last_checked as string | null) ?? EPOCH;

  // 1. Growth-linked portals (demo portals excluded — founder self-views)
  const { data: proposalData, error: proposalsError } = await supabase
    .from("growth_generated_proposals")
    .select("id, company_id, lead_id, shared_link_id, slug, status, first_opened_at, open_count, last_opened_at")
    .not("shared_link_id", "is", null);
  if (proposalsError) throw new Error(`growth_generated_proposals read failed: ${proposalsError.message}`);

  const proposals = ((proposalData ?? []) as ProposalRow[]).filter(p => !isDemoSlug(p.slug));

  const saveState = async (watermark: string) => {
    const { error } = await supabase.from("alert_state").upsert(
      { key: JOB, last_checked: watermark, meta: {}, updated_at: runStartIso },
      { onConflict: "key" },
    );
    if (error) throw new Error(`alert_state write failed: ${error.message}`);
  };

  if (proposals.length === 0) {
    await saveState(windowEnd);
    return { proposals: 0, new_events: 0 };
  }

  const linkIds = [...new Set(proposals.map(p => p.shared_link_id))];

  // 2. New view events on growth-linked portals in (lastChecked, now - safety lag]
  const { data: eventData, error: eventsError } = await supabase
    .from("link_events")
    .select("id, link_id, created_at")
    .in("link_id", linkIds)
    .eq("event_type", OPEN_EVENT_TYPE)
    .gt("created_at", lastChecked)
    .lte("created_at", windowEnd)
    .order("created_at", { ascending: true })
    .limit(EVENT_CAP);
  if (eventsError) throw new Error(`link_events read failed: ${eventsError.message}`);

  const events = (eventData ?? []) as EventRow[];
  // If the cap was hit, only advance to the last processed row so the remainder
  // is picked up next run instead of being silently skipped.
  const nextWatermark = events.length === EVENT_CAP ? events[events.length - 1].created_at : windowEnd;

  if (events.length === 0) {
    await saveState(windowEnd);
    return { proposals: proposals.length, new_events: 0 };
  }

  const affectedLinkIds = [...new Set(events.map(e => e.link_id))];

  // 3. Absolute stats per affected link → update proposals (stats + status)
  const statsEntries = await Promise.all(
    affectedLinkIds.map(async (linkId): Promise<[string, LinkStats]> => [linkId, await loadLinkStats(supabase, linkId)]),
  );
  const statsByLink = new Map(statsEntries);

  const affectedProposals = proposals.filter(p => statsByLink.has(p.shared_link_id));
  let statusUpgrades = 0;

  await Promise.all(
    affectedProposals.map(async p => {
      const stats = statsByLink.get(p.shared_link_id)!;
      const candidate = stats.engaged_count > 0 ? "engaged" : stats.open_count > 0 ? "opened" : p.status;
      const newStatus =
        (STATUS_RANK[candidate] ?? 0) > (STATUS_RANK[p.status] ?? 0) ? candidate : p.status;
      if (newStatus !== p.status) statusUpgrades++;

      const { error } = await supabase
        .from("growth_generated_proposals")
        .update({
          open_count: stats.open_count,
          first_opened_at: stats.first_opened_at,
          last_opened_at: stats.last_opened_at,
          status: newStatus,
        })
        .eq("id", p.id);
      if (error) throw new Error(`proposal update failed for ${p.id}: ${error.message}`);

      // Keep the in-memory row current for the contact/company rollups below.
      p.open_count = stats.open_count;
      p.first_opened_at = stats.first_opened_at;
      p.last_opened_at = stats.last_opened_at;
      p.status = newStatus;
    }),
  );

  // 4. Resolve proposal → contact (lead.primary_contact_id, else the company's
  //    primary contact) and proposal → company for the rollups.
  const leadIds = [...new Set(proposals.map(p => p.lead_id).filter((v): v is string => !!v))];
  let leads: LeadRow[] = [];
  if (leadIds.length > 0) {
    const { data, error } = await supabase
      .from("growth_leads")
      .select("id, company_id, primary_contact_id")
      .in("id", leadIds);
    if (error) throw new Error(`growth_leads read failed: ${error.message}`);
    leads = (data ?? []) as LeadRow[];
  }
  const leadById = new Map(leads.map(l => [l.id, l]));

  const companyOf = (p: ProposalRow): string | null =>
    p.company_id ?? (p.lead_id ? leadById.get(p.lead_id)?.company_id ?? null : null);

  // (codex review) Fallback is limited to an EXPLICIT primary contact
  // (is_primary=true). Companies with several contacts and no designated
  // primary get no contact rollup rather than an arbitrary one.
  const companyIds = [...new Set(proposals.map(companyOf).filter((v): v is string => !!v))];
  let fallbackContacts: ContactRow[] = [];
  if (companyIds.length > 0) {
    const { data, error } = await supabase
      .from("growth_contacts")
      .select("id, company_id, is_primary")
      .in("company_id", companyIds)
      .eq("is_primary", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`growth_contacts read failed: ${error.message}`);
    fallbackContacts = (data ?? []) as ContactRow[];
  }
  const primaryContactByCompany = new Map<string, string>();
  for (const c of fallbackContacts) {
    if (!primaryContactByCompany.has(c.company_id)) primaryContactByCompany.set(c.company_id, c.id);
  }

  const contactOf = (p: ProposalRow): string | null => {
    const lead = p.lead_id ? leadById.get(p.lead_id) : null;
    if (lead?.primary_contact_id) return lead.primary_contact_id;
    const companyId = companyOf(p);
    return companyId ? primaryContactByCompany.get(companyId) ?? null : null;
  };

  // 5. growth_contacts rollup — aggregate across ALL of the contact's portals
  //    (updated absolute stats for affected links, stored columns for the rest).
  const affectedContactIds = new Set(
    affectedProposals.map(contactOf).filter((v): v is string => !!v),
  );
  let contactsUpdated = 0;
  for (const contactId of affectedContactIds) {
    let openCount = 0;
    let first: string | null = null;
    let last: string | null = null;
    for (const p of proposals) {
      if (contactOf(p) !== contactId) continue;
      openCount += p.open_count;
      first = minIso(first, p.first_opened_at);
      last = maxIso(last, p.last_opened_at);
    }
    const { error } = await supabase
      .from("growth_contacts")
      .update({ portal_open_count: openCount, portal_opened_at: first, portal_last_opened_at: last })
      .eq("id", contactId);
    if (error) throw new Error(`growth_contacts update failed for ${contactId}: ${error.message}`);
    contactsUpdated++;
  }

  // 6. Append growth_outreach_events rows (one per new view; deduped by
  //    metadata.link_event_id — occurred_at-window query keeps the URL bounded,
  //    the partial unique index is the concurrent-run backstop).
  const proposalByLink = new Map<string, ProposalRow>();
  for (const p of proposals) proposalByLink.set(p.shared_link_id, p); // last wins (newest ordering not needed: one link ↔ one proposal in practice)

  const { data: existingRows, error: existingError } = await supabase
    .from("growth_outreach_events")
    .select("metadata")
    .eq("type", "portal_open")
    .gte("occurred_at", lastChecked)
    .limit(2000);
  if (existingError) throw new Error(`growth_outreach_events dedup read failed: ${existingError.message}`);
  const existingEventIds = new Set(
    ((existingRows ?? []) as Array<{ metadata: { link_event_id?: string } | null }>)
      .map(r => r.metadata?.link_event_id)
      .filter((v): v is string => !!v),
  );

  const eventRowsToInsert = events
    .filter(e => !existingEventIds.has(e.id))
    .map(e => {
      const p = proposalByLink.get(e.link_id);
      if (!p) return null;
      return {
        lead_id: p.lead_id,
        contact_id: contactOf(p),
        channel: "portal",
        type: "portal_open",
        direction: "inbound",
        occurred_at: e.created_at,
        metadata: { link_event_id: e.id, link_id: e.link_id, slug: p.slug },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (eventRowsToInsert.length > 0) {
    const { error } = await supabase.from("growth_outreach_events").insert(eventRowsToInsert);
    if (error) throw new Error(`growth_outreach_events insert failed: ${error.message}`);
  }

  // 7. Legacy outreach_log rollup, matched via growth_companies.name (the same
  //    conservative name match the growth-CRM backfill used).
  const affectedCompanyIds = [...new Set(affectedProposals.map(companyOf).filter((v): v is string => !!v))];
  let outreachRowsUpdated = 0;
  if (affectedCompanyIds.length > 0) {
    const { data: companies, error: companiesError } = await supabase
      .from("growth_companies")
      .select("id, name")
      .in("id", affectedCompanyIds);
    if (companiesError) throw new Error(`growth_companies read failed: ${companiesError.message}`);

    const { data: logRows, error: logError } = await supabase
      .from("outreach_log")
      .select("id, company_name");
    if (logError) throw new Error(`outreach_log read failed: ${logError.message}`);

    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const logByName = new Map<string, string[]>();
    for (const row of (logRows ?? []) as Array<{ id: string; company_name: string | null }>) {
      const key = norm(row.company_name);
      if (!key) continue;
      logByName.set(key, [...(logByName.get(key) ?? []), row.id]);
    }

    for (const company of (companies ?? []) as Array<{ id: string; name: string }>) {
      const ids = logByName.get(norm(company.name)) ?? [];
      if (ids.length === 0) continue;

      let openCount = 0;
      let first: string | null = null;
      let last: string | null = null;
      for (const p of proposals) {
        if (companyOf(p) !== company.id) continue;
        openCount += p.open_count;
        first = minIso(first, p.first_opened_at);
        last = maxIso(last, p.last_opened_at);
      }

      const { error } = await supabase
        .from("outreach_log")
        .update({ portal_open_count: openCount, portal_opened_at: first, portal_last_opened_at: last })
        .in("id", ids);
      if (error) throw new Error(`outreach_log update failed for ${company.name}: ${error.message}`);
      outreachRowsUpdated += ids.length;
    }
  }

  // 8. Advance the watermark only after every write above succeeded.
  await saveState(nextWatermark);

  return {
    proposals: proposals.length,
    new_events: events.length,
    proposals_updated: affectedProposals.length,
    status_upgrades: statusUpgrades,
    contacts_updated: contactsUpdated,
    outreach_events_appended: eventRowsToInsert.length,
    outreach_log_rows_updated: outreachRowsUpdated,
  };
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
    const result = await runSync(supabase);
    await recordHeartbeat(JOB, { ok: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = toErrorMessage(err);
    // Fail-loud: red cron run + heartbeat error (listed in the daily-brief Cron
    // health section). Watermark untouched → next run retries idempotently.
    console.error("[outreach-sync] FAILED:", message);
    await recordHeartbeat(JOB, { ok: false, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
