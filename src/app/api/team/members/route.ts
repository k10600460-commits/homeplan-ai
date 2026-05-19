import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: members } = await supabase
    .from("team_members")
    .select("id, email, role, status, invited_at, joined_at")
    .eq("team_owner_id", user.id)
    .neq("status", "removed")
    .order("invited_at", { ascending: true });

  // For each active member, fetch usage stats (non-blocking best-effort)
  const memberStats = await Promise.all(
    (members ?? []).map(async (m) => {
      if (!m.status || m.status !== "active") return { ...m, planCount: 0, lastActive: null };
      // Get user_id from team_members
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("id", m.id)
        .single();
      if (!tm?.user_id) return { ...m, planCount: 0, lastActive: null };
      // Count this month's plans
      const month = new Date().toISOString().slice(0, 7);
      const { data: usage } = await supabaseAdmin
        .from("api_usage")
        .select("request_count")
        .eq("user_id", tm.user_id)
        .eq("month", month)
        .maybeSingle();
      return { ...m, planCount: usage?.request_count ?? 0, lastActive: null };
    })
  );

  return NextResponse.json({ members: memberStats });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberId } = await req.json() as { memberId?: string };
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", memberId)
    .eq("team_owner_id", user.id);

  return NextResponse.json({ success: true });
}
