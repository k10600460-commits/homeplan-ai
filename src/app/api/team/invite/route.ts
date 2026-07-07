import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getUserPlan } from "@/lib/usage";
import { requestOrigin } from "@/lib/request-url";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_MEMBERS = 15;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only team owners can invite
  const plan = await getUserPlan(user.id);
  if (plan !== "team") {
    return NextResponse.json({ error: "Team plan required to invite members" }, { status: 403 });
  }

  const { email } = await req.json() as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (email.toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
  }

  // Count existing active/invited members (excluding owner)
  const { count } = await supabaseAdmin
    .from("team_members")
    .select("id", { count: "exact" })
    .eq("team_owner_id", user.id)
    .neq("status", "removed");

  if ((count ?? 0) >= MAX_MEMBERS - 1) {
    return NextResponse.json({ error: `Team limit reached (max ${MAX_MEMBERS} including owner)` }, { status: 400 });
  }

  // Create or update invitation
  const token = crypto.randomUUID();
  const { data: member, error: upsertErr } = await supabaseAdmin
    .from("team_members")
    .upsert({
      team_owner_id: user.id,
      email: email.toLowerCase(),
      role: "member",
      status: "invited",
      invite_token: token,
      invited_at: new Date().toISOString(),
    }, { onConflict: "team_owner_id,email" })
    .select("id, invite_token")
    .single();

  if (upsertErr || !member) {
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }

  // Send invitation email via Resend
  const inviteUrl = `${requestOrigin(req)}/invite?token=${member.invite_token}`;
  const { sendTeamInviteEmail } = await import("@/lib/emails");
  await sendTeamInviteEmail(email, user.email ?? "Your team owner", inviteUrl).catch(console.error);

  return NextResponse.json({ success: true, inviteUrl });
}
