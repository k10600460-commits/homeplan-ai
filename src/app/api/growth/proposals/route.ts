import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanString,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

const PROPOSAL_SELECT = `
  id,
  company_id,
  lead_id,
  shared_link_id,
  slug,
  metro,
  lot_descriptor,
  status,
  built_at,
  first_opened_at,
  open_count,
  last_opened_at,
  created_at
`;

type ProposalRow = {
  id: string;
  company_id: string | null;
  lead_id: string | null;
  shared_link_id: string | null;
  slug: string | null;
  metro: string | null;
  lot_descriptor: string | null;
  status: "draft" | "sent" | "opened" | "engaged";
  built_at: string;
  first_opened_at: string | null;
  open_count: number;
  last_opened_at: string | null;
  created_at: string;
};

type OpenStats = {
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
};

function cleanPortalSlug(value: unknown): string | null {
  const raw = cleanString(value, 255);
  if (!raw) return null;

  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const match = withoutOrigin.match(/\/s\/([^/?#]+)/i);
  const slug = match?.[1] ?? withoutOrigin.replace(/^\/+/, "").split(/[/?#]/)[0];
  return slug || null;
}

function applyOpenStats(proposals: ProposalRow[], byLinkId: Map<string, OpenStats>) {
  return proposals.map((proposal) => {
    const liveStats = proposal.shared_link_id ? byLinkId.get(proposal.shared_link_id) : null;
    return {
      ...proposal,
      open_count: liveStats?.open_count ?? 0,
      first_opened_at: liveStats?.first_opened_at ?? null,
      last_opened_at: liveStats?.last_opened_at ?? null,
    };
  });
}

async function loadLiveOpenStats(
  supabase: SupabaseClient,
  proposals: ProposalRow[],
) {
  const linkIds = Array.from(new Set(proposals.map((proposal) => proposal.shared_link_id).filter(Boolean))) as string[];
  if (linkIds.length === 0) return applyOpenStats(proposals, new Map());

  const statsEntries = await Promise.all(linkIds.map(async (linkId): Promise<[string, OpenStats]> => {
    const [countResult, firstResult, lastResult] = await Promise.all([
      supabase
        .from("link_events")
        .select("id", { count: "exact", head: true })
        .eq("link_id", linkId)
        .eq("event_type", "view"),
      supabase
        .from("link_events")
        .select("created_at")
        .eq("link_id", linkId)
        .eq("event_type", "view")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("link_events")
        .select("created_at")
        .eq("link_id", linkId)
        .eq("event_type", "view")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const error = countResult.error ?? firstResult.error ?? lastResult.error;
    if (error) {
      console.error("[growth/proposals] failed to load link events:", error.message);
      throw error;
    }

    return [linkId, {
      open_count: countResult.count ?? 0,
      first_opened_at: (firstResult.data as { created_at?: string } | null)?.created_at ?? null,
      last_opened_at: (lastResult.data as { created_at?: string } | null)?.created_at ?? null,
    }];
  }));

  return applyOpenStats(proposals, new Map(statsEntries));
}

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const leadId = req.nextUrl.searchParams.get("lead_id");
  const companyId = req.nextUrl.searchParams.get("company_id");

  let query = gate.supabase
    .from("growth_generated_proposals")
    .select(PROPOSAL_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (leadId) query = query.eq("lead_id", leadId);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load proposals" }, { status: 500 });

  try {
    const proposals = await loadLiveOpenStats(gate.supabase, (data ?? []) as ProposalRow[]);
    return NextResponse.json({ proposals });
  } catch {
    return NextResponse.json({ error: "Failed to load proposal open stats" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const leadId = cleanString(body.lead_id, 80);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const sharedLinkId = cleanString(body.shared_link_id, 80);
  const slug = cleanPortalSlug(body.slug);
  if (!sharedLinkId && !slug) {
    return NextResponse.json({ error: "slug or shared_link_id required" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await gate.supabase
    .from("growth_leads")
    .select("id, company_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  let linkQuery = gate.supabase
    .from("shared_links")
    .select("id, slug, is_active")
    .limit(1);

  linkQuery = sharedLinkId ? linkQuery.eq("id", sharedLinkId) : linkQuery.eq("slug", slug);

  const { data: links, error: linkError } = await linkQuery;
  if (linkError) return NextResponse.json({ error: "Failed to load shared portal" }, { status: 500 });

  const link = links?.[0] as { id: string; slug: string; is_active: boolean } | undefined;
  if (!link) return NextResponse.json({ error: "Shared portal not found" }, { status: 404 });
  if (!link.is_active) return NextResponse.json({ error: "Shared portal is inactive" }, { status: 400 });

  const payload = {
    lead_id: lead.id,
    company_id: lead.company_id,
    shared_link_id: link.id,
    slug: link.slug,
    metro: nullableString(body.metro, 120) ?? null,
    lot_descriptor: nullableString(body.lot_descriptor, 500) ?? null,
  };

  // Future enhancement: deep-link to /generate with prospect fields prefilled,
  // then return here after the normal share flow creates /s/{slug}.
  const { data, error } = await gate.supabase
    .from("growth_generated_proposals")
    .insert(payload)
    .select(PROPOSAL_SELECT)
    .single();

  if (error) return NextResponse.json({ error: "Failed to link proposal" }, { status: 500 });

  try {
    const [proposal] = await loadLiveOpenStats(gate.supabase, [data as ProposalRow]);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch {
    return NextResponse.json({ proposal: data }, { status: 201 });
  }
}
