import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = {
  approve: { status: "approved", label: "承認", color: "#059669" },
  reject: { status: "rejected", label: "却下", color: "#b91c1c" },
  hold: { status: "hold", label: "保留", color: "#b45309" },
} as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "未決",
  approved: "承認",
  rejected: "却下",
  hold: "保留",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function html(heading: string, detail: string, color: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center;color:#111827">
  <div style="width:56px;height:56px;border-radius:50%;background:${color}1a;margin:0 auto 20px"></div>
  <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:${color}">${heading}</h1>
  <p style="color:#374151;font-size:15px;line-height:1.6;word-break:break-word">${detail}</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:28px">SplanAI Research · この画面は閉じて構いません</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// NOTE (accepted risk — per plan, one-tap UX): this GET mutates state. Decision
// URLs are placed ONLY on Flex URI buttons (never as body text), so LINE does not
// link-preview / prefetch them, and the idempotent conditional update below makes
// any stray re-hit safe. If strict prefetch-proofing is ever required, split into
// GET (confirmation page) + POST (commit with a nonce).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const action = req.nextUrl.searchParams.get("action") ?? "";

  if (!token || !(action in ACTIONS)) {
    return html("リンクが無効です", "このリンクは無効です。ボタンからもう一度お試しください。", "#dc2626", 400);
  }
  const act = ACTIONS[action as keyof typeof ACTIONS];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: row } = await supabase
    .from("line_proposals")
    .select("id, title, status")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    return html("リンクが無効です", "この提案は見つかりませんでした。", "#dc2626", 404);
  }

  const title = escapeHtml(row.title ?? "");

  // Already decided → idempotent (safe for re-taps and any link prefetch).
  if (row.status !== "pending") {
    return html(
      "記録済み",
      `すでに「${STATUS_LABEL[row.status] ?? row.status}」で記録済みです：${title}`,
      "#6b7280",
    );
  }

  // Conditional update guards against a double-tap race: only the first
  // pending → decided transition wins; a later tap matches zero rows.
  const { data: updated, error } = await supabase
    .from("line_proposals")
    .update({ status: act.status, decided_at: new Date().toISOString(), decided_via: "line" })
    .eq("token", token)
    .eq("status", "pending")
    .select("id");

  if (error) {
    return html("エラー", "記録に失敗しました。少し待ってからもう一度お試しください。", "#dc2626", 500);
  }

  if (!updated || updated.length === 0) {
    const { data: cur } = await supabase
      .from("line_proposals")
      .select("status")
      .eq("token", token)
      .maybeSingle();
    const st = cur?.status ?? "unknown";
    return html("記録済み", `すでに「${STATUS_LABEL[st] ?? st}」で記録済みです：${title}`, "#6b7280");
  }

  return html("記録しました", `✅ ${act.label} を記録しました：${title}`, act.color);
}
