import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashIp } from "@/lib/crypto";
import { getClientIp } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear credentials and mark disconnected (keep row for audit trail)
    const { error } = await supabase
      .from("mls_connections")
      .update({
        status:                 "disconnected",
        access_token_encrypted: null,
        client_id_encrypted:    "",
        client_secret_encrypted: "",
        token_expires_at:       null,
        disconnected_at:        new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider", "trestle");

    if (error) throw error;

    // Audit log
    supabase.from("mls_audit_logs").insert({
      user_id:  user.id,
      action:   "disconnect",
      metadata: { provider: "trestle" },
      ip_hash:  hashIp(getClientIp(req)),
    }).then(() => {}, (e) => console.error("[MLS audit]", e));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[MLS disconnect]", err);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
