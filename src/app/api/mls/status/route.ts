import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const { data } = await supabase
      .from("mls_connections")
      .select("status, connected_at, token_expires_at")
      .eq("user_id", user.id)
      .eq("provider", "trestle")
      .eq("status", "active")
      .single();

    if (!data) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected:    true,
      connectedAt:  data.connected_at,
      expiresAt:    data.token_expires_at,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
