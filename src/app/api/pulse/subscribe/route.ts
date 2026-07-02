import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimitDB } from "@/lib/rate-limit-db";
import { getClientIp } from "@/lib/security";
import { hashIp } from "@/lib/crypto";
import { insertEvent } from "@/lib/analytics";
import { normalizePulseSubscription } from "@/lib/pulse";

export const runtime = "nodejs";

// /pulse "Weekly builder market digest" opt-in — STORAGE ONLY.
// Sending is intentionally OFF (no double opt-in, no confirmation email); a
// human decision wires buildPulseDigestEmail (src/lib/emails.ts) to a sender
// later. pulse_subscribers has service_role-only RLS, so this route is the
// single public write path.
//
// Spam guard (per spec — fail-closed NOT required here, unlike demo-guard):
//   - strict email shape + metro allowlist (normalizePulseSubscription)
//   - 3 signups per IP per 24h via the shared check_rate_limit RPC
//     (DB-backed, cross-instance; fails open on RPC outage by design)
//   - duplicate email×metro answered 200 (unique index absorbs it; no new row)

const PG_UNIQUE_VIOLATION = "23505";
const RATE_LIMIT = { limit: 3, windowSec: 24 * 60 * 60 };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const input = normalizePulseSubscription(body);
  if (!input.ok) {
    return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  }

  const ipHash = hashIp(getClientIp(req));
  const rl = await checkRateLimitDB(`pulse-sub:ip:${ipHash}`, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[pulse-subscribe] missing Supabase env");
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error } = await supabase.from("pulse_subscribers").insert({
    email: input.email,
    metro: input.metro,
    ip_hash: ipHash,
  });

  if (error && error.code !== PG_UNIQUE_VIOLATION) {
    console.error("[pulse-subscribe] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  // Duplicates get the same success response (idempotent; nothing to enumerate).
  if (!error) {
    insertEvent("pulse_subscribe", null, { metadata: { metro: input.metro ?? "all" } });
  }

  return NextResponse.json({ ok: true });
}
