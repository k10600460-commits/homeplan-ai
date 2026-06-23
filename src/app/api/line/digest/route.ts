import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, timingSafeEqual } from "crypto";
import { buildDigestCarousel, pushMessages, type DigestProposal } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 128-bit unguessable decision token. These ride on public GET links with no
// expiry, so use full crypto entropy (32 hex chars) rather than the shorter
// shared_links slug scheme.
function generateToken(): string {
  return randomBytes(16).toString("hex");
}

interface IncomingProposal {
  title?: unknown;
  url?: unknown;
  why_it_matters?: unknown;
  action_tag?: unknown;
  score?: unknown;
}

// Trim + bound a string field; returns null for empty / non-string input.
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// Only accept http(s) URLs for the article link (it becomes a LINE URI button).
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

// Strict calendar-date check (the regex alone passes 2026-99-99 / 2026-02-30).
function isValidRunDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Constant-time Bearer comparison (avoids leaking the secret via response timing).
function bearerOk(header: string | null): boolean {
  const secret = process.env.RESEARCH_DIGEST_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Dedicated secret (NOT CRON_SECRET) to limit blast radius — this endpoint can
  // only insert proposals + push a LINE digest, so its key is intentionally narrow.
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { run_date?: unknown; summary?: unknown; proposals?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runDate = typeof body.run_date === "string" ? body.run_date : "";
  if (!isValidRunDate(runDate)) {
    return NextResponse.json({ error: "run_date (valid YYYY-MM-DD) is required" }, { status: 400 });
  }
  const summary = str(body.summary, 200);
  const incoming = Array.isArray(body.proposals) ? (body.proposals as IncomingProposal[]) : [];
  // Decision links always target the host this request arrived on (splanai.com in
  // prod) — never a caller-supplied value, so the approve buttons can't be pointed
  // at an arbitrary origin.
  const baseUrl = new URL(req.url).origin;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // No proposals → one honest text line (mirrors the email's "0 adopted" report).
  if (incoming.length === 0) {
    const line = await pushMessages([
      { type: "text", text: `📊 SplanAI Research ${runDate} — 本日は採用0件（詳細はメール参照）` },
    ]);
    return NextResponse.json({ ok: true, inserted: 0, line_status: line.status, line_ok: line.ok });
  }

  const rows = incoming.slice(0, 50).map(p => {
    const scoreNum = Number(p.score);
    return {
      token: generateToken(),
      run_date: runDate,
      title: str(p.title, 500) ?? "(untitled)",
      url: safeHttpUrl(p.url),
      why_it_matters: str(p.why_it_matters, 1000),
      action_tag: str(p.action_tag, 100),
      score: Number.isFinite(scoreNum) ? Math.trunc(scoreNum) : null,
      source: "daily-research",
      status: "pending",
    };
  });

  const { data: inserted, error } = await supabase
    .from("line_proposals")
    .insert(rows)
    .select("token, title, url, why_it_matters, action_tag, score");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const carousel = buildDigestCarousel(inserted as DigestProposal[], baseUrl, runDate, summary);
  const line = await pushMessages([carousel]);

  return NextResponse.json({
    ok: true,
    inserted: inserted?.length ?? 0,
    line_status: line.status,
    line_ok: line.ok,
    ...(line.ok ? {} : { line_error: line.body.slice(0, 300) }),
  });
}
