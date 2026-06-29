import { NextRequest, NextResponse } from "next/server";
import {
  BUILDER_TYPES,
  COMPANY_SOURCES,
  COMPANY_STATUSES,
  SIZE_BANDS,
  TIERS,
  cleanString,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const tier = req.nextUrl.searchParams.get("tier");
  const status = req.nextUrl.searchParams.get("status");
  const metro = req.nextUrl.searchParams.get("metro");

  if (tier && !isAllowed(tier, TIERS)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  if (status && !isAllowed(status, COMPANY_STATUSES)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let query = gate.supabase
    .from("growth_companies")
    .select("id, name, website, domain, metro, state, custom_ratio_note, size_band, builder_type, tier, source, status, notes, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (tier) query = query.eq("tier", tier);
  if (status) query = query.eq("status", status);
  if (metro) query = query.eq("metro", metro.trim());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });

  return NextResponse.json({ companies: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = cleanString(body.name, 200);
  if (!name) return NextResponse.json({ error: "Company name required" }, { status: 400 });

  const payload: Record<string, unknown> = {
    name,
    website: nullableString(body.website, 500) ?? null,
    domain: nullableString(body.domain, 255) ?? null,
    metro: nullableString(body.metro, 120) ?? null,
    state: nullableString(body.state, 80) ?? null,
    custom_ratio_note: nullableString(body.custom_ratio_note, 500) ?? null,
    notes: nullableString(body.notes, 2000) ?? null,
  };

  if (body.size_band !== undefined) {
    if (!isAllowed(body.size_band, SIZE_BANDS)) return NextResponse.json({ error: "Invalid size_band" }, { status: 400 });
    payload.size_band = body.size_band;
  }
  if (body.builder_type !== undefined) {
    if (!isAllowed(body.builder_type, BUILDER_TYPES)) return NextResponse.json({ error: "Invalid builder_type" }, { status: 400 });
    payload.builder_type = body.builder_type;
  }
  if (body.tier !== undefined) {
    if (!isAllowed(body.tier, TIERS)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    payload.tier = body.tier;
  }
  if (body.source !== undefined) {
    if (!isAllowed(body.source, COMPANY_SOURCES)) return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    payload.source = body.source;
  }
  if (body.status !== undefined) {
    if (!isAllowed(body.status, COMPANY_STATUSES)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    payload.status = body.status;
  }

  const { data, error } = await gate.supabase
    .from("growth_companies")
    .insert(payload)
    .select("id, name, website, domain, metro, state, custom_ratio_note, size_band, builder_type, tier, source, status, notes, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  return NextResponse.json({ company: data }, { status: 201 });
}
