import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("team_profiles")
    .select("company_name, logo_url, primary_color")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    companyName: data?.company_name ?? "",
    logoUrl: data?.logo_url ?? null,
    primaryColor: data?.primary_color ?? "#2563EB",
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { companyName?: string; primaryColor?: string };

  const update: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body.companyName !== undefined) {
    update.company_name = body.companyName.trim().slice(0, 100);
  }
  if (body.primaryColor !== undefined) {
    // Accept only hex colors
    if (/^#[0-9A-Fa-f]{6}$/.test(body.primaryColor)) {
      update.primary_color = body.primaryColor;
    }
  }

  await admin().from("team_profiles").upsert(
    { owner_user_id: user.id, ...update },
    { onConflict: "owner_user_id" },
  );

  return NextResponse.json({ success: true });
}
