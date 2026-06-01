import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? "k10600460@gmail.com";
const INBOX_EMAIL = "hello@splanai.com";
const FROM_EMAIL = "SplanAI <noreply@splanai.com>";

// Domains / patterns to treat as system/automated noise (never draft replies)
const NOISE_SENDERS = [
  "noreply@", "no-reply@", "mailer-daemon@",
  "stripe.com", "supabase.io", "supabase.com",
  "vercel.com", "resend.com", "github.com",
  "google.com", "googlealerts-noreply@", "producthunt.com",
  "anthropic.com",
  // Shoji's own test addresses
  "k10600460@gmail.com",
];

// X post angles rotated by weekday (0=Sun … 6=Sat)
const X_ANGLES = [
  "founder",        // Sun
  "roi",            // Mon
  "feature",        // Tue
  "use_case",       // Wed
  "market_insight", // Thu
  "social_proof",   // Fri
  "behind_scenes",  // Sat
];

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

function isNoiseSender(from: string): boolean {
  const lower = from.toLowerCase();
  return NOISE_SENDERS.some(n => lower.includes(n));
}

function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null }> | null;
} | null | undefined): string {
  if (!payload) return "";
  // Direct text/plain
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  // Multipart — look for text/plain part
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback: first part with data
    for (const part of payload.parts) {
      if (part.body?.data) return decodeBase64Url(part.body.data);
    }
  }
  return "";
}

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

interface EmailThread {
  threadId: string;
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
}

interface ClauseResult {
  drafts: Array<{
    threadId: string;
    category: "lead" | "support" | "noise";
    summaryJa: string;
    draftEn: string;
  }>;
  xPosts: Array<{
    angle: string;
    text: string;
    platform: string;
  }>;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const todayJST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD

  // Idempotency: skip if already ran today
  const { data: existing } = await supabase
    .from("daily_brief_log")
    .select("id, sent_at")
    .eq("run_date", todayJST)
    .maybeSingle();
  if (existing?.sent_at) {
    return NextResponse.json({ ok: true, skipped: "already_ran", date: todayJST });
  }

  const logId = existing?.id ?? null;

  // ── 1. Gmail: fetch inbox threads from last 24h ──────────────────────────
  const threads: EmailThread[] = [];
  let gmailError: string | null = null;

  const gmailConfigured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN;

  if (gmailConfigured) {
    try {
      const gmail = getGmailClient();
      const listRes = await gmail.users.threads.list({
        userId: "me",
        q: `in:inbox newer_than:1d to:${INBOX_EMAIL}`,
        maxResults: 30,
      });

      for (const t of listRes.data.threads ?? []) {
        if (!t.id) continue;
        const threadRes = await gmail.users.threads.get({
          userId: "me",
          id: t.id,
          format: "full",
        });
        const msgs = threadRes.data.messages ?? [];
        if (!msgs.length) continue;
        const latest = msgs[msgs.length - 1];
        const headers = latest.payload?.headers ?? [];

        const from = getHeader(headers, "from");
        if (isNoiseSender(from)) continue;

        // Skip if List-Unsubscribe header is present (marketing emails)
        if (getHeader(headers, "list-unsubscribe")) continue;

        const fromName = from.replace(/<[^>]+>/, "").trim().replace(/"/g, "");
        const subject = getHeader(headers, "subject") || "(no subject)";
        const body = extractBody(latest.payload);
        const snippet = body.slice(0, 500);
        const internalDate = Number(latest.internalDate ?? 0);

        threads.push({
          threadId: t.id,
          messageId: latest.id ?? "",
          from: from.match(/<([^>]+)>/)?.[1] ?? from,
          fromName,
          subject,
          snippet,
          receivedAt: new Date(internalDate),
        });
      }
    } catch (err) {
      gmailError = err instanceof Error ? err.message : String(err);
      console.error("[daily-brief] Gmail error:", gmailError);
    }
  } else {
    gmailError = "Gmail OAuth not configured — set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN";
    console.warn("[daily-brief] Gmail not configured — skipping inbox read");
  }

  // ── 2. Collect DB stats for the KPI block ───────────────────────────────
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [subsResult, financeResult, portalViewsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status", { count: "exact" })
      .in("status", ["active", "trialing"]),
    supabase
      .from("finance_snapshots")
      .select("mrr, active_pro, active_team, trialing, churned_today")
      .order("date", { ascending: false })
      .limit(2),
    supabase
      .from("link_events")
      .select("link_id", { count: "exact" })
      .eq("event_type", "view")
      .gte("created_at", since24h),
  ]);

  const todaySnap = financeResult.data?.[0];
  const prevSnap = financeResult.data?.[1];
  const mrr = todaySnap?.mrr ?? 0;
  const mrrPrev = prevSnap?.mrr ?? 0;
  const mrrDelta = mrr - mrrPrev;

  // Portal opens in last 24h
  const portalViewCount = portalViewsResult.count ?? 0;
  const uniquePortalIds = new Set(
    (portalViewsResult.data ?? []).map((e: { link_id: string }) => e.link_id),
  );
  const uniquePortalCount = uniquePortalIds.size;

  interface PortalDetail { client_name: string | null; slug: string }
  let topPortals: PortalDetail[] = [];
  if (uniquePortalIds.size > 0) {
    const { data: pd } = await supabase
      .from("shared_links")
      .select("client_name, slug")
      .in("id", Array.from(uniquePortalIds))
      .limit(5);
    topPortals = (pd ?? []) as PortalDetail[];
  }

  // Escalation: check for high-impact legal diffs
  const { data: escalations } = await supabase
    .from("legal_watch_diffs")
    .select("id, url, impact_level, ai_assessment, snapshot_at")
    .eq("impact_level", "High")
    .is("reviewed_at", null)
    .order("snapshot_at", { ascending: false })
    .limit(5);

  // ── 3. Claude API: classify + draft + X posts ────────────────────────────
  let claudeResult: ClauseResult = { drafts: [], xPosts: [] };
  let claudeError: string | null = null;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && (threads.length > 0 || true)) {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const weekday = new Date().getDay();
    const primaryAngle = X_ANGLES[weekday];
    const secondaryAngle = X_ANGLES[(weekday + 1) % 7];

    const emailsBlock =
      threads.length > 0
        ? threads
            .map(
              (t, i) =>
                `[${i + 1}] threadId=${t.threadId}\nFrom: ${t.fromName} <${t.from}>\nSubject: ${t.subject}\nSnippet: ${t.snippet}`,
            )
            .join("\n\n")
        : "（受信トレイに新規メールなし）";

    const prompt = `You are the AI secretary for SplanAI (splanai.com) — an AI floor plan generation tool for small US home builders. The founder is Shoji Shiraishi (Japanese, based in Japan).

Today is ${todayJST}.

## Task 1: Email Triage
Classify each email below and generate a reply draft for lead/support emails.

Emails:
${emailsBlock}

Classification rules:
- "lead": a home builder or potential customer showing interest / asking about the product
- "support": an existing user with a question or issue
- "noise": anything that doesn't need a reply (newsletter, partnership spam, misc)

For each lead or support email, write:
- summaryJa: 1-2 sentences in Japanese summarizing what they want (for Shoji)
- draftEn: a warm, professional English reply from Shoji as founder (2-4 short paragraphs, max 200 words)

## Task 2: X Post Drafts
Generate 2 X (Twitter) post ideas for SplanAI today.
- Post 1 angle: "${primaryAngle}"
- Post 2 angle: "${secondaryAngle}"
Angles: roi=ROI/numbers for builders, feature=product feature highlight, use_case=builder workflow, market_insight=housing market data, social_proof=traction/testimonial, founder=personal founder story, behind_scenes=build-in-public

Rules: max 280 chars each, no hashtag spam (max 2), no emoji spam, write in the voice of a solo founder talking to home builders.

## Response format (JSON only, no markdown):
{
  "drafts": [
    {
      "threadId": "...",
      "category": "lead|support|noise",
      "summaryJa": "...",
      "draftEn": "..."
    }
  ],
  "xPosts": [
    { "angle": "${primaryAngle}", "text": "...", "platform": "x" },
    { "angle": "${secondaryAngle}", "text": "...", "platform": "x" }
  ]
}`;

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        claudeResult = JSON.parse(jsonMatch[0]) as ClauseResult;
      }
    } catch (err) {
      claudeError = err instanceof Error ? err.message : String(err);
      console.error("[daily-brief] Claude error:", claudeError);
    }
  }

  // ── 4. Persist to Supabase ───────────────────────────────────────────────
  const draftMap = new Map(claudeResult.drafts.map(d => [d.threadId, d]));

  const replyDraftRows = threads
    .map(t => {
      const d = draftMap.get(t.threadId);
      return {
        gmail_thread_id: t.threadId,
        gmail_message_id: t.messageId,
        from_email: t.from,
        from_name: t.fromName,
        subject: t.subject,
        body_snippet: t.snippet,
        category: d?.category ?? "noise",
        summary_ja: d?.summaryJa ?? null,
        draft_en: d?.draftEn ?? null,
        status: "pending",
        received_at: t.receivedAt.toISOString(),
      };
    });

  // Upsert reply_drafts (gmail_thread_id is unique — skip if already processed)
  if (replyDraftRows.length > 0) {
    await supabase
      .from("reply_draft")
      .upsert(replyDraftRows, { onConflict: "gmail_thread_id", ignoreDuplicates: true });
  }

  // Insert x_post_drafts
  if (claudeResult.xPosts.length > 0) {
    await supabase.from("x_post_draft").insert(
      claudeResult.xPosts.map(p => ({
        run_date: todayJST,
        angle: p.angle,
        draft_text: p.text,
        platform: p.platform ?? "x",
        status: "draft",
      })),
    );
  }

  // ── 5. Build & send digest email ─────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY);

  const leadsAndSupport = claudeResult.drafts.filter(d => d.category !== "noise");
  const leadCount = claudeResult.drafts.filter(d => d.category === "lead").length;
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo",
  });

  const html = buildDigestHtml({
    date: todayLabel,
    todayJST,
    mrr: Number(mrr),
    mrrDelta: Number(mrrDelta),
    activePro: todaySnap?.active_pro ?? subsResult.count ?? 0,
    activeTeam: todaySnap?.active_team ?? 0,
    trialing: todaySnap?.trialing ?? 0,
    churnedToday: todaySnap?.churned_today ?? 0,
    portalViewCount,
    uniquePortalCount,
    topPortals,
    threads,
    actionableThreads: leadsAndSupport,
    drafts: claudeResult.drafts,
    xPosts: claudeResult.xPosts,
    escalations: escalations ?? [],
    gmailError,
    claudeError,
  });

  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `🗓 SplanAI Daily Brief — ${todayJST}${leadCount > 0 ? ` 📬 ${leadCount} lead${leadCount > 1 ? "s" : ""}` : ""}`,
    html,
  });

  if (sendError) {
    console.error("[daily-brief] Send error:", sendError);
  }

  // ── 6. Log run ───────────────────────────────────────────────────────────
  const logPayload = {
    run_date: todayJST,
    threads_found: threads.length,
    leads_found: leadCount,
    drafts_created: leadsAndSupport.length,
    x_posts_created: claudeResult.xPosts.length,
    sent_at: sendError ? null : new Date().toISOString(),
    error: sendError ? JSON.stringify(sendError) : (gmailError ?? claudeError ?? null),
  };

  if (logId) {
    await supabase.from("daily_brief_log").update(logPayload).eq("id", logId);
  } else {
    await supabase.from("daily_brief_log").insert(logPayload);
  }

  return NextResponse.json({
    ok: true,
    date: todayJST,
    threadsFound: threads.length,
    leadsFound: leadCount,
    xPostsCreated: claudeResult.xPosts.length,
    emailSent: !sendError,
    gmailConfigured: !!gmailConfigured,
  });
}

// ── HTML digest builder ────────────────────────────────────────────────────

interface DigestParams {
  date: string;
  todayJST: string;
  mrr: number;
  mrrDelta: number;
  activePro: number;
  activeTeam: number;
  trialing: number;
  churnedToday: number;
  portalViewCount: number;
  uniquePortalCount: number;
  topPortals: Array<{ client_name: string | null; slug: string }>;
  threads: EmailThread[];
  actionableThreads: ClauseResult["drafts"];
  drafts: ClauseResult["drafts"];
  xPosts: ClauseResult["xPosts"];
  escalations: Array<{ id: string; url: string; impact_level: string | null; ai_assessment: string | null }>;
  gmailError: string | null;
  claudeError: string | null;
}

function buildDigestHtml(p: DigestParams): string {
  const mrrSign = p.mrrDelta >= 0 ? "+" : "";
  const mrrColor = p.mrrDelta >= 0 ? "#10b981" : "#ef4444";

  const kpiRows = [
    ["MRR", `$${p.mrr.toLocaleString()} <span style="color:${mrrColor};font-size:13px;">(${mrrSign}$${Math.abs(p.mrrDelta).toFixed(0)})</span>`],
    ["Active Pro", String(p.activePro)],
    ["Active Team", String(p.activeTeam)],
    ["Trialing", String(p.trialing)],
    ["Churned Today", String(p.churnedToday)],
    ["Portal Views (24h)", `${p.portalViewCount} views · ${p.uniquePortalCount} portal${p.uniquePortalCount !== 1 ? "s" : ""}`],
  ];

  const kpiHtml = kpiRows
    .map(
      ([label, val]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:16px;font-weight:700;color:#1e40af;">${val}</td>
    </tr>`,
    )
    .join("");

  const escalationHtml =
    p.escalations.length > 0
      ? p.escalations
          .map(
            e => `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
        <span style="color:#dc2626;font-size:12px;font-weight:700;">HIGH — Legal Watch</span>
        <p style="margin:4px 0;font-size:13px;color:#374151;">${e.url}</p>
        ${e.ai_assessment ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">${e.ai_assessment}</p>` : ""}
      </div>`,
          )
          .join("")
      : `<p style="color:#6b7280;font-size:13px;">No escalations today.</p>`;

  const inboxHtml =
    p.threads.length === 0
      ? `<p style="color:#6b7280;font-size:13px;">${p.gmailError ? `Gmail error: ${p.gmailError}` : "No new messages in inbox."}</p>`
      : p.drafts
          .filter(d => d.category !== "noise")
          .map(d => {
            const t = p.threads.find(x => x.threadId === d.threadId);
            const categoryColor = d.category === "lead" ? "#10b981" : "#3b82f6";
            const categoryLabel = d.category === "lead" ? "LEAD" : "SUPPORT";
            return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="background:${categoryColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">${categoryLabel}</span>
          <span style="font-size:13px;font-weight:600;color:#111827;">${t?.fromName ?? ""} &lt;${t?.from ?? ""}&gt;</span>
        </div>
        <p style="margin:0 0 4px;font-size:13px;color:#374151;font-weight:600;">${t?.subject ?? "(no subject)"}</p>
        <p style="margin:0 0 10px;font-size:12px;color:#6b7280;">${d.summaryJa}</p>
        <div style="background:#f8fafc;border-left:3px solid #3b82f6;padding:12px;border-radius:0 4px 4px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Draft Reply</p>
          <p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;">${d.draftEn}</p>
        </div>
        <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
          <a href="https://mail.google.com/mail/#inbox/${t?.threadId}" style="color:#3b82f6;text-decoration:none;">Open in Gmail →</a>
        </p>
      </div>`;
          })
          .join("");

  const noiseCount = p.drafts.filter(d => d.category === "noise").length;
  const noiseNote =
    noiseCount > 0
      ? `<p style="color:#9ca3af;font-size:12px;">${noiseCount} noise/auto email${noiseCount > 1 ? "s" : ""} filtered out.</p>`
      : "";

  const xPostsHtml =
    p.xPosts.length === 0
      ? `<p style="color:#6b7280;font-size:13px;">${p.claudeError ? `Claude error: ${p.claudeError}` : "No posts generated."}</p>`
      : p.xPosts
          .map(
            (x, i) => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Post ${i + 1} · ${x.angle}</p>
        <p style="margin:0;font-size:14px;color:#111827;white-space:pre-wrap;">${x.text}</p>
        <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">${x.text.length}/280 chars</p>
      </div>`,
          )
          .join("");

  const portalHtml =
    p.portalViewCount === 0
      ? `<p style="color:#6b7280;font-size:13px;">No portal opens in the last 24h.</p>`
      : `<p style="color:#374151;font-size:14px;margin:0 0 10px;">
          <strong>${p.portalViewCount}</strong> view${p.portalViewCount !== 1 ? "s" : ""} across
          <strong>${p.uniquePortalCount}</strong> unique portal${p.uniquePortalCount !== 1 ? "s" : ""}
        </p>` +
        p.topPortals.map(pt => `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:#111827;">${pt.client_name ?? "(unnamed)"}</span>
        <a href="https://splanai.com/s/${pt.slug}" style="font-size:11px;color:#3b82f6;text-decoration:none;">View portal →</a>
      </div>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 36px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">SplanAI Daily Brief</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">${p.date} · auto-generated, not auto-sent</p>
    </div>

    <div style="padding:28px 36px;">

      <!-- KPI Snapshot -->
      <h2 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">📊 KPI Snapshot</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">${kpiHtml}</table>

      <!-- Portal Opens -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🔗 Portal Opens (24h)</h2>
      <div style="margin-bottom:28px;">${portalHtml}</div>

      <!-- Escalations -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🚨 Escalations</h2>
      <div style="margin-bottom:28px;">${escalationHtml}</div>

      <!-- Inbox Triage -->
      <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">📬 Inbox (${p.threads.length} new)</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">Leads &amp; support only. Reply drafts below — paste into Gmail, edit as needed, then send manually.</p>
      <div style="margin-bottom:4px;">${inboxHtml}</div>
      ${noiseNote}

      <!-- X Post Drafts -->
      <h2 style="margin:28px 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🐦 X Post Drafts (post manually)</h2>
      <div>${xPostsHtml}</div>

    </div>

    <div style="background:#f9fafb;padding:16px 36px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        SplanAI Auto-Secretary · <a href="https://splanai.com/dashboard" style="color:#3b82f6;text-decoration:none;">Dashboard</a>
        · Generated at 08:00 JST — nothing was auto-sent or auto-posted
      </p>
    </div>

  </div>
</body>
</html>`;
}
