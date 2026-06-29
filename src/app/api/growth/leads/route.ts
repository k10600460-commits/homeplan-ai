import { NextRequest, NextResponse } from "next/server";
import {
  LEAD_CHANNELS,
  LEAD_OWNERS,
  LEAD_STAGES,
  cleanString,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

const LEAD_SELECT = `
  id,
  company_id,
  primary_contact_id,
  stage,
  channel,
  owner,
  next_action,
  next_action_date,
  reason_lost,
  created_at,
  updated_at,
  growth_companies(id, name, metro, state, tier, status)
`;

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const stage = req.nextUrl.searchParams.get("stage");
  if (stage && !isAllowed(stage, LEAD_STAGES)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  let query = gate.supabase
    .from("growth_leads")
    .select(LEAD_SELECT)
    .order("next_action_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (stage) query = query.eq("stage", stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });

  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const companyId = cleanString(body.company_id, 80);
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const payload: Record<string, unknown> = {
    company_id: companyId,
    primary_contact_id: nullableString(body.primary_contact_id, 80) ?? null,
    next_action: nullableString(body.next_action, 500) ?? null,
    next_action_date: nullableString(body.next_action_date, 20) ?? null,
    reason_lost: nullableString(body.reason_lost, 500) ?? null,
  };

  if (body.stage !== undefined) {
    if (!isAllowed(body.stage, LEAD_STAGES)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    payload.stage = body.stage;
  }
  if (body.channel !== undefined) {
    if (!isAllowed(body.channel, LEAD_CHANNELS)) return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    payload.channel = body.channel;
  }
  if (body.owner !== undefined) {
    if (!isAllowed(body.owner, LEAD_OWNERS)) return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    payload.owner = body.owner;
  }

  const { data, error } = await gate.supabase
    .from("growth_leads")
    .insert(payload)
    .select(LEAD_SELECT)
    .single();

  if (error) return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  return NextResponse.json({ lead: data }, { status: 201 });
}
