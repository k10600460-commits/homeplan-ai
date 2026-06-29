import { NextResponse } from "next/server";
import {
  CAMPAIGN_CHANNELS,
  cleanString,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

const CAMPAIGN_SELECT = "id, name, channel, goal, sequence, started_at, ended_at, active, created_at";

function jsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "object") return value;
  return undefined;
}

export async function GET() {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const { data, error } = await gate.supabase
    .from("growth_campaigns")
    .select(CAMPAIGN_SELECT)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = cleanString(body.name, 200);
  if (!name) return NextResponse.json({ error: "Campaign name required" }, { status: 400 });

  const payload: Record<string, unknown> = {
    name,
    goal: nullableString(body.goal, 1000) ?? null,
    started_at: nullableString(body.started_at, 80) ?? null,
    ended_at: nullableString(body.ended_at, 80) ?? null,
    active: typeof body.active === "boolean" ? body.active : true,
  };

  if (body.channel !== undefined) {
    if (!isAllowed(body.channel, CAMPAIGN_CHANNELS)) return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    payload.channel = body.channel;
  }

  if (body.sequence !== undefined) {
    const sequence = jsonValue(body.sequence);
    if (sequence === undefined) return NextResponse.json({ error: "Invalid sequence" }, { status: 400 });
    payload.sequence = sequence;
  }

  const { data, error } = await gate.supabase
    .from("growth_campaigns")
    .insert(payload)
    .select(CAMPAIGN_SELECT)
    .single();

  if (error) return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
