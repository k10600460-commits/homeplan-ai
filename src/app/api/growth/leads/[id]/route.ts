import { NextRequest, NextResponse } from "next/server";
import {
  LEAD_OWNERS,
  LEAD_STAGES,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../../_shared";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const { id } = await params;
  const { data, error } = await gate.supabase
    .from("growth_leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ lead: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (body.stage !== undefined) {
    if (!isAllowed(body.stage, LEAD_STAGES)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    update.stage = body.stage;
  }
  if (body.owner !== undefined) {
    if (!isAllowed(body.owner, LEAD_OWNERS)) return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    update.owner = body.owner;
  }
  if (body.next_action !== undefined) update.next_action = nullableString(body.next_action, 500) ?? null;
  if (body.next_action_date !== undefined) update.next_action_date = nullableString(body.next_action_date, 20) ?? null;
  if (body.reason_lost !== undefined) update.reason_lost = nullableString(body.reason_lost, 500) ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No supported fields supplied" }, { status: 400 });
  }

  const { id } = await params;
  const { data, error } = await gate.supabase
    .from("growth_leads")
    .update(update)
    .eq("id", id)
    .select(LEAD_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ lead: data });
}
