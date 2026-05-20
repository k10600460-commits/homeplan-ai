import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, hashIp } from "@/lib/crypto";
import { getClientIp } from "@/lib/security";
import { getUserPlan } from "@/lib/usage";

const TRESTLE_TOKEN_URL = "https://api.trestle.com/connect/token";

async function fetchTrestleToken(clientId: string, clientSecret: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "api",
  });

  const res = await fetch(TRESTLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Trestle auth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan gate: MLS integration is Pro/Team only
    const plan = await getUserPlan(user.id);
    if (plan === "free") {
      return NextResponse.json(
        { error: "MLS integration requires Pro or Team plan.", upgradeUrl: "/pricing" },
        { status: 403 },
      );
    }

    const body = await req.json() as {
      clientId?: string;
      clientSecret?: string;
      agreedToTerms?: boolean;
    };

    const { clientId, clientSecret, agreedToTerms } = body;

    if (!clientId?.trim() || !clientSecret?.trim()) {
      return NextResponse.json(
        { error: "Client ID and Client Secret are required" },
        { status: 400 },
      );
    }

    if (!agreedToTerms) {
      return NextResponse.json(
        { error: "You must agree to the IDX terms of service" },
        { status: 400 },
      );
    }

    // Test credentials against Trestle OAuth
    const tokenData = await fetchTrestleToken(clientId.trim(), clientSecret.trim());

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Encrypt everything before storing
    const clientIdEnc     = encrypt(clientId.trim());
    const clientSecretEnc = encrypt(clientSecret.trim());
    const tokenEnc        = encrypt(tokenData.access_token);

    // Upsert connection (one per user per provider)
    const { error: upsertError } = await supabase
      .from("mls_connections")
      .upsert({
        user_id:                user.id,
        provider:               "trestle",
        client_id_encrypted:    clientIdEnc,
        client_secret_encrypted: clientSecretEnc,
        access_token_encrypted: tokenEnc,
        token_expires_at:       expiresAt,
        status:                 "active",
        agreed_to_terms:        true,
        connected_at:           new Date().toISOString(),
        disconnected_at:        null,
      }, { onConflict: "user_id,provider" });

    if (upsertError) throw upsertError;

    // Audit log (non-blocking)
    supabase.from("mls_audit_logs").insert({
      user_id:        user.id,
      provider:       "trestle",
      endpoint:       TRESTLE_TOKEN_URL,
      action_type:    "connect",
      response_status: 200,
      ip_hash:        hashIp(getClientIp(req)),
    }).then(() => {}, console.error);

    return NextResponse.json({ success: true, expiresAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    // Check for auth errors from Trestle
    if (msg.includes("401") || msg.includes("400") || msg.includes("auth failed")) {
      return NextResponse.json(
        { error: "Invalid credentials. Please check your Trestle Client ID and Secret." },
        { status: 400 },
      );
    }
    console.error("[MLS connect]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
