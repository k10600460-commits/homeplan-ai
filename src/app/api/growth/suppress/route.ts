import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPPRESSION_REASONS,
  cleanString,
  isAllowed,
  normalizeGrowthDomain,
  normalizeGrowthEmail,
  readJson,
  requireGrowthMaster,
} from "../_shared";

const SUPPRESSION_SELECT = "id, email, domain, company_id, reason, created_at, growth_companies(id, name, domain)";
const IDEMPOTENT_EMAIL_REASONS = new Set(["unsubscribe", "complaint", "bounce_hard"]);

async function findSuppressionByEmail(
  supabase: SupabaseClient,
  email: string,
) {
  return supabase
    .from("growth_suppression_list")
    .select(SUPPRESSION_SELECT)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
}

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const reason = req.nextUrl.searchParams.get("reason");
  const email = normalizeGrowthEmail(req.nextUrl.searchParams.get("email"));
  const domain = normalizeGrowthDomain(req.nextUrl.searchParams.get("domain"));

  if (reason && !isAllowed(reason, SUPPRESSION_REASONS)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  let query = gate.supabase
    .from("growth_suppression_list")
    .select(SUPPRESSION_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (reason) query = query.eq("reason", reason);
  if (email) query = query.ilike("email", email);
  if (domain) query = query.eq("domain", domain);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load suppression list" }, { status: 500 });

  return NextResponse.json({ suppressions: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!isAllowed(body.reason, SUPPRESSION_REASONS)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const email = body.email === undefined ? null : normalizeGrowthEmail(body.email);
  const domain = body.domain === undefined ? null : normalizeGrowthDomain(body.domain);
  const companyId = cleanString(body.company_id, 80);

  if (body.email !== undefined && !email) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (body.domain !== undefined && !domain) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (!email && !domain && !companyId) {
    return NextResponse.json({ error: "email, domain, or company_id required" }, { status: 400 });
  }

  if (email && IDEMPOTENT_EMAIL_REASONS.has(body.reason)) {
    const existing = await findSuppressionByEmail(gate.supabase, email);
    if (existing.error) {
      return NextResponse.json({ error: "Failed to check suppression list" }, { status: 500 });
    }
    if (existing.data) {
      return NextResponse.json({ suppression: existing.data, existing: true });
    }
  }

  const { data, error } = await gate.supabase
    .from("growth_suppression_list")
    .insert({
      email,
      domain,
      company_id: companyId ?? null,
      reason: body.reason,
    })
    .select(SUPPRESSION_SELECT)
    .single();

  if (error) {
    if (email && error.code === "23505") {
      const existing = await findSuppressionByEmail(gate.supabase, email);
      if (!existing.error && existing.data) {
        return NextResponse.json({ suppression: existing.data, existing: true });
      }
    }
    return NextResponse.json({ error: "Failed to create suppression entry" }, { status: 500 });
  }

  return NextResponse.json({ suppression: data, existing: false }, { status: 201 });
}
