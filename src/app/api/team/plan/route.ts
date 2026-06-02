import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getUserPlan } from "@/lib/usage";

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

  const db = admin();
  const [plan, profileResult] = await Promise.all([
    getUserPlan(user.id),
    db.from("team_profiles").select("company_name, logo_url, primary_color, phone, website, license_number, tagline").eq("owner_user_id", user.id).maybeSingle(),
  ]);

  let companyName = profileResult.data?.company_name ?? "";
  let logoUrl = profileResult.data?.logo_url ?? null;
  const primaryColor = profileResult.data?.primary_color ?? "#2563EB";
  let phone          = profileResult.data?.phone ?? "";
  let website        = profileResult.data?.website ?? "";
  let licenseNumber  = profileResult.data?.license_number ?? "";
  let tagline        = profileResult.data?.tagline ?? "";

  // For team members: inherit owner's branding
  if (!companyName && plan === "team") {
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_owner_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membership?.team_owner_id) {
      const { data: ownerProfile } = await db
        .from("team_profiles")
        .select("company_name, logo_url, primary_color, phone, website, license_number, tagline")
        .eq("owner_user_id", membership.team_owner_id)
        .maybeSingle();
      companyName   = ownerProfile?.company_name ?? "";
      logoUrl       = ownerProfile?.logo_url ?? null;
      phone         = ownerProfile?.phone ?? "";
      website       = ownerProfile?.website ?? "";
      licenseNumber = ownerProfile?.license_number ?? "";
      tagline       = ownerProfile?.tagline ?? "";
    }
  }

  // Generate signed URL for logo (1-hour TTL)
  let logoSignedUrl: string | null = null;
  if (logoUrl && (plan === "pro" || plan === "team")) {
    const { data: signed } = await db.storage.from("branding").createSignedUrl(logoUrl, 3600);
    logoSignedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ plan, companyName, logoSignedUrl, primaryColor, phone, website, licenseNumber, tagline });
}
