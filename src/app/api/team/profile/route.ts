import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("team_profiles")
    .select("company_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ companyName: data?.company_name ?? "" });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyName } = await req.json() as { companyName?: string };
  if (companyName === undefined) {
    return NextResponse.json({ error: "companyName required" }, { status: 400 });
  }

  await supabase.from("team_profiles").upsert({
    owner_user_id: user.id,
    company_name: companyName.trim().slice(0, 100),
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_user_id" });

  return NextResponse.json({ success: true });
}
