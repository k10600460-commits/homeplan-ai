import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

// GET /api/leads — list the authenticated builder's inbound portal leads (RLS: owner_select_own_leads).
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("portal_leads")
    .select("id, link_id, buyer_name, buyer_email, buyer_phone, plan_index, message, status, note, created_at, updated_at")
    .eq("builder_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}
