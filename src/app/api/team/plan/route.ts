import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/usage";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [plan, profileResult] = await Promise.all([
    getUserPlan(user.id),
    supabase.from("team_profiles").select("company_name").eq("owner_user_id", user.id).maybeSingle(),
  ]);

  // Also check if member of a team (get owner's company name)
  let companyName = profileResult.data?.company_name ?? "";
  if (!companyName && plan === "team") {
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_owner_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membership?.team_owner_id) {
      const { data: ownerProfile } = await supabase
        .from("team_profiles")
        .select("company_name")
        .eq("owner_user_id", membership.team_owner_id)
        .maybeSingle();
      companyName = ownerProfile?.company_name ?? "";
    }
  }

  return NextResponse.json({ plan, companyName });
}
