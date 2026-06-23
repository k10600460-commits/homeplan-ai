import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 3 (B): turn the founder's LINE approve/reject/hold history into a compact
// "taste profile" the daily routine can fold into its audit. Reuses the routine's
// existing RESEARCH_DIGEST_SECRET (the routine is the only caller) — no new secret.
// Path is under /api/line/* so the existing firewall bypass already covers it.
function bearerOk(header: string | null): boolean {
  const secret = process.env.RESEARCH_DIGEST_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Below this many decisions the signal is too thin — stay on defaults + exploration.
const MIN_DECISIONS = 10;

interface DecisionRow {
  title: string | null;
  action_tag: string | null;
  score: number | null;
  status: string;
}

export async function GET(req: NextRequest) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Bounded window of actual decisions (pending excluded), newest first.
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("line_proposals")
    .select("title, action_tag, score, status, decided_at")
    .in("status", ["approved", "rejected", "hold"])
    .gte("decided_at", since)
    .order("decided_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as DecisionRow[];
  const total = rows.length;

  // Per-tag approve rate (hold excluded from the denominator) + score averages.
  const tally = new Map<string, { approved: number; rejected: number; hold: number }>();
  let scApSum = 0, scApN = 0, scRjSum = 0, scRjN = 0;
  for (const r of rows) {
    const tag = (r.action_tag || "未分類").trim();
    const t = tally.get(tag) ?? { approved: 0, rejected: 0, hold: 0 };
    if (r.status === "approved") t.approved++;
    else if (r.status === "rejected") t.rejected++;
    else if (r.status === "hold") t.hold++;
    tally.set(tag, t);
    if (typeof r.score === "number") {
      if (r.status === "approved") { scApSum += r.score; scApN++; }
      else if (r.status === "rejected") { scRjSum += r.score; scRjN++; }
    }
  }

  const byTag = Array.from(tally.entries())
    .map(([tag, t]) => {
      const denom = t.approved + t.rejected;
      return {
        tag,
        approved: t.approved,
        rejected: t.rejected,
        hold: t.hold,
        approve_rate: denom > 0 ? Math.round((t.approved / denom) * 100) : null,
      };
    })
    .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected));

  const favored = byTag
    .filter(x => x.approve_rate !== null && x.approve_rate >= 60 && x.approved >= 2)
    .map(x => x.tag);
  const downranked = byTag
    .filter(x => x.approve_rate !== null && x.approve_rate <= 30 && x.rejected >= 2)
    .map(x => x.tag);

  const recentApproved = rows.filter(r => r.status === "approved").slice(0, 8).map(r => r.title ?? "").filter(Boolean);
  const recentRejected = rows.filter(r => r.status === "rejected").slice(0, 8).map(r => r.title ?? "").filter(Boolean);

  const scoreApprovedAvg = scApN > 0 ? Math.round((scApSum / scApN) * 10) / 10 : null;
  const scoreRejectedAvg = scRjN > 0 ? Math.round((scRjSum / scRjN) * 10) / 10 : null;

  // Guidance the routine folds into STEP 2. ALWAYS preserves novelty + an
  // exploration quota so the profile can never collapse into a filter bubble.
  let guidance: string;
  if (total < MIN_DECISIONS) {
    guidance = `学習データ不足（判断${total}件 < ${MIN_DECISIONS}）。デフォルト基準で収集・監査し、新規性(N)を最優先に幅広く探索する。嗜好への最適化はまだ行わない。`;
  } else {
    const parts: string[] = [];
    if (favored.length) parts.push(`採用が多いタグ: ${favored.join(" / ")} を相対的に優先`);
    if (downranked.length) parts.push(`却下が多いタグ: ${downranked.join(" / ")} は down-weight（恒久除外しない）`);
    if (scoreApprovedAvg !== null && scoreRejectedAvg !== null) {
      parts.push(`承認の平均スコア≈${scoreApprovedAvg} / 却下≈${scoreRejectedAvg}`);
    }
    guidance =
      `判断${total}件の傾向: ${parts.join("。 ") || "明確な偏りなし"}。` +
      ` 最重要: 新規性(N)・反証・逆張りは必ず残し、過去の採用傾向に寄せすぎない。` +
      ` 毎回1〜2件は本プロファイルを無視した“探索枠”を必ず含める。` +
      ` 却下=「今は不要/既知」かもしれず恒久NGではない（down-weight止まり）。hold=中立（スヌーズ）。`;
  }

  return NextResponse.json({
    ok: true,
    total_decisions: total,
    cold_start: total < MIN_DECISIONS,
    by_tag: byTag,
    favored_tags: favored,
    downranked_tags: downranked,
    score_avg: { approved: scoreApprovedAvg, rejected: scoreRejectedAvg },
    recent_approved_titles: recentApproved,
    recent_rejected_titles: recentRejected,
    guidance,
  });
}
