import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dedicated secret for the local pickup job (NOT the digest/cron secrets) — this
// endpoint can only read approved proposals + mark them processed, so its key is
// intentionally narrow and lives only in Vercel env + the Mac's Keychain.
function bearerOk(header: string | null): boolean {
  const secret = process.env.LINE_PICKUP_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET: the pickup queue — proposals approved in LINE but not yet handed to the
// vault (.raw/ → /ppp). Oldest decision first.
export async function GET(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await admin()
    .from("line_proposals")
    .select("id, token, run_date, title, url, why_it_matters, action_tag, score, decided_at")
    .eq("status", "approved")
    .is("processed_at", null)
    .order("decided_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data?.length ?? 0, proposals: data ?? [] });
}

// POST { ids: [...] }: mark the given approved rows processed. Idempotent — only
// rows still approved & unprocessed are touched, so a re-POST is a no-op.
export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }
  const { data, error } = await admin()
    .from("line_proposals")
    .update({ processed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "approved")
    .is("processed_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, processed: data?.length ?? 0 });
}
