import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type LeadStatus = "new" | "won" | "lost";
const VALID_STATUSES: LeadStatus[] = ["new", "won", "lost"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse body
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const status: unknown = body.status;
  if (!VALID_STATUSES.includes(status as LeadStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const newStatus = status as LeadStatus;

  // won requires signed_at
  if (newStatus === "won" && !body.signed_at) {
    return NextResponse.json(
      { error: "signed_at required when status is won" },
      { status: 400 },
    );
  }

  // contract_value must be a non-negative number if provided
  if (body.contract_value !== undefined && body.contract_value !== null) {
    const cv = Number(body.contract_value);
    if (isNaN(cv) || cv < 0) {
      return NextResponse.json(
        { error: "contract_value must be a non-negative number" },
        { status: 400 },
      );
    }
  }

  // Fetch lead — ownership check
  const { data: lead, error: fetchErr } = await supabase
    .from("portal_leads")
    .select("id, link_id, builder_user_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.builder_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Update portal_leads
  const { data: updatedLead, error: leadErr } = await supabase
    .from("portal_leads")
    .update({ status: newStatus, status_updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }

  // 2. deals upsert / update
  let dealResult: Record<string, unknown> | null = null;

  if (newStatus === "won") {
    const contractValue =
      body.contract_value !== undefined && body.contract_value !== null
        ? Number(body.contract_value)
        : null;

    const { data, error: dealErr } = await supabase
      .from("deals")
      .upsert(
        {
          builder_user_id: user.id,
          lead_id: id,
          link_id: lead.link_id ?? null,
          status: "won",
          signed_at: body.signed_at,
          contract_value: contractValue,
          property_address: body.property_address ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "lead_id" },
      )
      .select()
      .single();

    if (dealErr) {
      return NextResponse.json({ error: dealErr.message }, { status: 500 });
    }
    dealResult = data;
  } else if (newStatus === "lost") {
    // Update existing deal to lost, if present
    const { data, error: dealErr } = await supabase
      .from("deals")
      .update({ status: "lost" })
      .eq("lead_id", id)
      .select()
      .maybeSingle();

    if (dealErr) {
      return NextResponse.json({ error: dealErr.message }, { status: 500 });
    }
    dealResult = data ?? null;
  } else {
    // status = 'new' — revert deal to pending if it exists
    const { data, error: dealErr } = await supabase
      .from("deals")
      .update({ status: "pending" })
      .eq("lead_id", id)
      .select()
      .maybeSingle();

    if (dealErr) {
      return NextResponse.json({ error: dealErr.message }, { status: 500 });
    }
    dealResult = data ?? null;
  }

  return NextResponse.json({ lead: updatedLead, deal: dealResult });
}
