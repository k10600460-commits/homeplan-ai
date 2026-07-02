import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual, randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuses the narrow LINE_PICKUP_SECRET (Vercel env + Mac Keychain) — same bearer
// pattern as /api/line/pickup. This endpoint only inserts pending proposals; the
// human still approves/rejects each one in LINE before anything is processed.
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

interface ProposalInput {
  title?: unknown;
  why_it_matters?: unknown;
  url?: unknown;
  action_tag?: unknown;
  score?: unknown;
  source?: unknown;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

// Only accept http(s) URLs — the value later becomes a LINE URI button in msg5,
// and LINE rejects an invalid URI, which would fail the whole brief's push.
function safeHttpUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

// POST { proposals: [{ title, why_it_matters?, url?, action_tag?, score?, source? }] }
// Inserts pending knowledge-loop proposals (source defaults to "knowledge-loop").
// Idempotent: a proposal whose (source, title) already has ANY prior row —
// pending/hold/approved OR rejected — is skipped, so the local job can re-POST
// every morning without creating duplicates AND a rejected item is never
// re-nagged the next day. (A promoted atom drops out upstream too: the writer
// stops detecting it once its promotion-status flips to 昇格済.)
export async function POST(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { proposals?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.proposals) || body.proposals.length === 0) {
    return NextResponse.json({ error: "proposals[] required" }, { status: 400 });
  }

  const db = admin();
  const runDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD JST

  let inserted = 0;
  let skipped = 0;

  for (const raw of body.proposals as ProposalInput[]) {
    const title = str(raw?.title, 500);
    if (!title) {
      skipped++;
      continue;
    }
    const source = str(raw?.source, 100) ?? "knowledge-loop";

    // Idempotent dedup on (source, title): skip if ANY prior row exists
    // (pending/hold/approved/rejected) — prevents duplicate-pending and
    // post-rejection daily re-nag alike.
    const { data: existing, error: dupErr } = await db
      .from("line_proposals")
      .select("id")
      .eq("source", source)
      .eq("title", title)
      .in("status", ["pending", "hold", "approved", "rejected"])
      .limit(1);
    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }
    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const score = Number.isFinite(raw?.score as number)
      ? Math.trunc(raw?.score as number)
      : null;
    const token = randomBytes(16).toString("hex");

    const { error: insErr } = await db.from("line_proposals").insert({
      token,
      run_date: runDate,
      title,
      url: safeHttpUrl(raw?.url),
      why_it_matters: str(raw?.why_it_matters, 1000),
      action_tag: str(raw?.action_tag, 100),
      score,
      source,
      status: "pending",
    });
    if (insErr) {
      // 23505 = unique_violation: the partial unique index on (source, title)
      // for knowledge-loop rows lost a race with a concurrent POST. Treat it as
      // a dedup skip (idempotent), not a hard error.
      if ((insErr as { code?: string }).code === "23505") {
        skipped++;
        continue;
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    inserted++;
  }

  // Intentionally NOT returning the decision tokens: each is a bearer capability
  // for /api/line/decision (no extra auth), so the proposer never needs it and it
  // must not leak into the local job's logs. Counts only.
  return NextResponse.json({ ok: true, inserted, skipped });
}
