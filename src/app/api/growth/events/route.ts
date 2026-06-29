import { NextRequest, NextResponse } from "next/server";
import {
  OUTREACH_CHANNELS,
  OUTREACH_DIRECTIONS,
  OUTREACH_SENTIMENTS,
  OUTREACH_TYPES,
  cleanString,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

const EVENT_SELECT = "id, lead_id, contact_id, campaign_id, channel, type, direction, template_key, sentiment, body_excerpt, occurred_at, metadata, created_at";

function jsonObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const leadId = req.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const { data, error } = await gate.supabase
    .from("growth_outreach_events")
    .select(EVENT_SELECT)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: "Failed to load events" }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const leadId = cleanString(body.lead_id, 80);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  if (!isAllowed(body.channel, OUTREACH_CHANNELS)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  if (!isAllowed(body.type, OUTREACH_TYPES)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    lead_id: leadId,
    channel: body.channel,
    type: body.type,
    contact_id: nullableString(body.contact_id, 80) ?? null,
    campaign_id: nullableString(body.campaign_id, 80) ?? null,
    template_key: nullableString(body.template_key, 120) ?? null,
    body_excerpt: nullableString(body.body_excerpt, 2000) ?? null,
    occurred_at: nullableString(body.occurred_at, 80) ?? new Date().toISOString(),
  };

  if (body.direction !== undefined) {
    if (!isAllowed(body.direction, OUTREACH_DIRECTIONS)) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
    payload.direction = body.direction;
  }
  if (body.sentiment !== undefined) {
    if (!isAllowed(body.sentiment, OUTREACH_SENTIMENTS)) return NextResponse.json({ error: "Invalid sentiment" }, { status: 400 });
    payload.sentiment = body.sentiment;
  }
  if (body.metadata !== undefined) {
    const metadata = jsonObject(body.metadata);
    if (metadata === null) return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    payload.metadata = metadata;
  }

  const { data, error } = await gate.supabase
    .from("growth_outreach_events")
    .insert(payload)
    .select(EVENT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
