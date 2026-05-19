import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Find the invitation
  const { data: member, error } = await supabaseAdmin
    .from("team_members")
    .select("id, email, status")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !member) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }
  if (member.status === "active") {
    return NextResponse.json({ success: true, alreadyActive: true });
  }
  // Email must match (case-insensitive)
  if (member.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: "This invitation was sent to a different email address" }, { status: 403 });
  }

  await supabaseAdmin
    .from("team_members")
    .update({
      user_id: user.id,
      status: "active",
      joined_at: new Date().toISOString(),
    })
    .eq("id", member.id);

  return NextResponse.json({ success: true });
}
