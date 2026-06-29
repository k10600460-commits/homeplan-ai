import { NextRequest, NextResponse } from "next/server";
import {
  CONTACT_ROLES,
  EMAIL_STATUSES,
  cleanString,
  isAllowed,
  nullableString,
  readJson,
  requireGrowthMaster,
} from "../_shared";

export async function GET(req: NextRequest) {
  const gate = await requireGrowthMaster();
  if ("error" in gate) return gate.error;

  const companyId = req.nextUrl.searchParams.get("company_id");

  let query = gate.supabase
    .from("growth_contacts")
    .select("id, company_id, first_name, last_name, title, role, email, email_status, linkedin_url, phone, is_primary, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [] });
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
    first_name: nullableString(body.first_name, 100) ?? null,
    last_name: nullableString(body.last_name, 100) ?? null,
    title: nullableString(body.title, 160) ?? null,
    email: nullableString(body.email, 255) ?? null,
    linkedin_url: nullableString(body.linkedin_url, 500) ?? null,
    phone: nullableString(body.phone, 80) ?? null,
    is_primary: typeof body.is_primary === "boolean" ? body.is_primary : false,
  };

  if (body.role !== undefined) {
    if (!isAllowed(body.role, CONTACT_ROLES)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    payload.role = body.role;
  }
  if (body.email_status !== undefined) {
    if (!isAllowed(body.email_status, EMAIL_STATUSES)) return NextResponse.json({ error: "Invalid email_status" }, { status: 400 });
    payload.email_status = body.email_status;
  }

  const { data, error } = await gate.supabase
    .from("growth_contacts")
    .insert(payload)
    .select("id, company_id, first_name, last_name, title, role, email, email_status, linkedin_url, phone, is_primary, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}
