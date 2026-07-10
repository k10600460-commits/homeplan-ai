import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import { buildNewsCarousel, buildDigestCarousel, pushMessages, type DigestProposal } from "@/lib/line";
import { BANNED_WORDS } from "@/lib/content-quality";
import { parseHeartbeatIssue, recordHeartbeat } from "@/lib/heartbeat";
import { trackedMessage, recordError, getCostSummary, getErrorSummary } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Research & Audit uses the Anthropic web_search tool (multiple searches) which
// adds latency on top of Gmail + DB + Haiku. Raise the function ceiling so the
// brief never gets killed mid-run. Requires Vercel Pro (300s cron cap).
export const maxDuration = 300;

// Daily-brief recipient. hello@splanai.com is a live Gmail Workspace mailbox
// (the founder's monitored business inbox, and the very inbox this brief reads
// below via `to:hello@splanai.com`), so it reliably receives. Overridable via
// DAILY_BRIEF_TO. The brief is sent FROM noreply@ which is in NOISE_SENDERS, so
// it is filtered out of the next day's inbox triage (no self-referential loop).
const ADMIN_EMAIL = process.env.DAILY_BRIEF_TO ?? "hello@splanai.com";
const INBOX_EMAIL = "hello@splanai.com";
const FROM_EMAIL = "SplanAI <noreply@splanai.com>";

// Domains / patterns to treat as system/automated noise (never draft replies)
const NOISE_SENDERS = [
  "noreply@", "no-reply@", "mailer-daemon@",
  "stripe.com", "supabase.io", "supabase.com",
  "vercel.com", "resend.com", "github.com",
  "google.com", "googlealerts-noreply@", "producthunt.com",
  "anthropic.com",
  // DMARC rua receivers (dmarcreport@microsoft.com etc.) — robot digests (2026-07-10)
  "dmarc",
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

interface ResearchItem {
  title: string;
  url: string;
  source: string;
  published: string;
  summary: string;
  scores: { r: number; c: number; n: number; a: number; total: number };
  whyItMatters: string;
  tag: string;
}
interface ResearchResult {
  items: ResearchItem[];
  rejectedNotes: string[];
}

interface HotLead {
  label: string;
  slug: string;
  city: string | null;
  state: string | null;
  events_7d: number;
  plan_selects: number;
  pdf_downloads: number;
  prequal_clicks: number;
  last_seen: string;
  next_action: string;
}

// ── Demo / pause config ──────────────────────────────────────────────────────
// Permanent demo portals — never counted as real leads or warm buyers.
// Source of truth: project-outreach memory (cedaridg = Tanaka-MTG demo, harpethn
// = second demo; both have client_email = null and only founder self-views).
const DEMO_SLUGS = new Set(["cedaridg", "harpethn"]);

// A shared_link is demo/test when its slug is in the denylist above. Used to
// keep demo portals out of every buyer-derived count (hot leads, nurture drafts).
// NOTE: client_email is NOT a usable demo signal in this app — share/create never
// sets it and portal opt-in stores the buyer address in portal_buyer_state, so
// every real portal also has client_email = null (verified via Codex review +
// DB). The slug denylist is the reliable discriminator; add new demo slugs here.
function isDemoLink(l: { slug?: string | null }): boolean {
  return l.slug != null && DEMO_SLUGS.has(l.slug);
}

// Outreach is intentionally paused (2026-06-20). Gates to resume:
//   (A) product-led copy rewrite incomplete,
//   (B) LinkedIn identity-verification recovery pending,
//   (C) CAN-SPAM physical (virtual-office) address not yet obtained.
// Single source of truth the founder flips manually: env OUTREACH_PAUSED.
// Defaults to paused (true) so a missing/unset env never silently re-fires the
// "resume outreach now" nag while the three gates are still open. Set
// OUTREACH_PAUSED=false in Vercel to resume ACT-TODAY outreach proposals.
const OUTREACH_PAUSED =
  process.env.OUTREACH_PAUSED != null
    ? process.env.OUTREACH_PAUSED === "true"
    : true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchHotLeads(supabase: any): Promise<HotLead[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("link_events")
    .select("link_id, event_type, created_at")
    .gte("created_at", since7d);

  if (!events?.length) return [];

  const agg = new Map<string, { events_7d: number; plan_selects: number; pdf_downloads: number; prequal_clicks: number; last_seen: string }>();
  for (const e of events as Array<{ link_id: string; event_type: string; created_at: string }>) {
    if (!agg.has(e.link_id)) agg.set(e.link_id, { events_7d: 0, plan_selects: 0, pdf_downloads: 0, prequal_clicks: 0, last_seen: e.created_at });
    const a = agg.get(e.link_id)!;
    a.events_7d++;
    if (e.event_type === "plan_selected") a.plan_selects++;
    if (e.event_type === "pdf_download") a.pdf_downloads++;
    if (e.event_type === "prequal_click") a.prequal_clicks++;
    if (e.created_at > a.last_seen) a.last_seen = e.created_at;
  }

  const hotEntries = Array.from(agg.entries())
    .filter(([, a]) => a.prequal_clicks >= 1 || a.plan_selects >= 1 || a.pdf_downloads >= 1 || a.events_7d >= 3)
    .sort((a, b) => b[1].last_seen.localeCompare(a[1].last_seen))
    .slice(0, 5);

  if (!hotEntries.length) return [];

  const hotLinkIds = hotEntries.map(([id]) => id);
  const { data: links } = await supabase
    .from("shared_links")
    .select("id, slug, client_name, builder_name, city, state")
    .in("id", hotLinkIds);

  return hotEntries
    .map(([link_id, a]) => {
      const l = (links as Array<{ id: string; slug: string; client_name: string | null; builder_name: string | null; city: string | null; state: string | null }> | null)?.find(x => x.id === link_id);
      if (!l || isDemoLink(l)) return null;
      const label = l.client_name?.trim() || l.builder_name?.trim() || l.slug;
      const next_action = a.prequal_clicks >= 1 ? "Buyer started pre-qualification — call now."
        : a.plan_selects >= 1 ? "Buyer selected a concept. Call today."
        : a.pdf_downloads >= 1 ? "Buyer downloaded the proposal. Follow up."
        : `Active ${a.events_7d}× this week — reach out.`;
      return { label, slug: l.slug, city: l.city ?? null, state: l.state ?? null, ...a, next_action };
    })
    .filter((x): x is HotLead => x !== null);
}

// Free mail domains + known test accounts to exclude from domain-match check
const FREE_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.co.jp','outlook.com','hotmail.com','icloud.com',
  'me.com','aol.com','protonmail.com','live.com','msn.com','mail.com',
]);
const EXCLUDED_USER_IDS = new Set([
  '12d6d041-0000-0000-0000-000000000000', // master/seed account — replace with real UUID if needed
]);

interface OveruseFlag {
  userId: string;
  email: string;
  plan: string;
  current: number;
  limit: number;
}
interface MultiDomainFlag { domain: string; count: number; emails: string[] }
interface OveruseFlags {
  nearLimit: OveruseFlag[];
  teamHighUsage: OveruseFlag[];
  multiDomains: MultiDomainFlag[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOveruseFlags(supabase: any): Promise<OveruseFlags> {
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const LIMITS: Record<string, number> = { free: 3, pro: 100, team: 9999 };

  const [subsResult, usageResult] = await Promise.all([
    supabase.from('subscriptions').select('user_id, plan').in('status', ['active', 'trialing']),
    supabase.from('api_usage').select('user_id, request_count').eq('month', currentMonth),
  ]);

  const subs = (subsResult.data ?? []) as Array<{ user_id: string; plan: string }>;
  const usageMap = new Map<string, number>(
    ((usageResult.data ?? []) as Array<{ user_id: string; request_count: number }>)
      .map(u => [u.user_id, u.request_count])
  );

  // Flag A: ≥80% of plan limit (Free/Pro only)
  const nearLimitRaw = subs
    .filter(s => !EXCLUDED_USER_IDS.has(s.user_id) && s.plan !== 'team')
    .map(s => ({ userId: s.user_id, plan: s.plan, current: usageMap.get(s.user_id) ?? 0, limit: LIMITS[s.plan] ?? 3 }))
    .filter(s => s.limit > 0 && s.current / s.limit >= 0.8);

  // Flag B: Team 250+ generations (fair-use review)
  const teamHighRaw = subs
    .filter(s => !EXCLUDED_USER_IDS.has(s.user_id) && s.plan === 'team')
    .map(s => ({ userId: s.user_id, plan: 'team', current: usageMap.get(s.user_id) ?? 0, limit: 9999 }))
    .filter(s => s.current >= 250);

  // Enrich with emails for flagged accounts
  const flaggedIds = [...new Set([...nearLimitRaw.map(x => x.userId), ...teamHighRaw.map(x => x.userId)])];
  const emailMap = new Map<string, string>();
  await Promise.all(flaggedIds.map(async uid => {
    try {
      const { data } = await supabase.auth.admin.getUserById(uid);
      if (data?.user?.email) emailMap.set(uid, data.user.email);
    } catch { /* non-critical */ }
  }));

  const nearLimit: OveruseFlag[] = nearLimitRaw.map(x => ({ ...x, email: emailMap.get(x.userId) ?? x.userId }));
  const teamHighUsage: OveruseFlag[] = teamHighRaw.map(x => ({ ...x, email: emailMap.get(x.userId) ?? x.userId }));

  // Flag C: Same business domain with 2+ accounts
  let multiDomains: MultiDomainFlag[] = [];
  try {
    const domainMap = new Map<string, string[]>();
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: listData } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      const users = listData?.users ?? [];
      for (const u of users as Array<{ id: string; email?: string }>) {
        if (!u.email || EXCLUDED_USER_IDS.has(u.id)) continue;
        const domain = u.email.split('@')[1]?.toLowerCase();
        if (!domain || FREE_DOMAINS.has(domain) || domain === 'splanai.com') continue;
        if (!domainMap.has(domain)) domainMap.set(domain, []);
        domainMap.get(domain)!.push(u.email);
      }
      if (users.length < 1000) break;
      page++;
    }
    multiDomains = Array.from(domainMap.entries())
      .filter(([, emails]) => emails.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([domain, emails]) => ({ domain, count: emails.length, emails }));
  } catch (err) {
    console.error('[daily-brief] fetchOveruseFlags domain check error:', err);
  }

  return { nearLimit, teamHighUsage, multiDomains };
}

// ── Proposals ────────────────────────────────────────────────────────────────
// Signal-bound, decision-ready action items. NOT free-form speculation — every
// proposal fires only when a concrete DB threshold is crossed, and its `why` is
// the raw numbers behind it. severity: act = do today · review = this week ·
// flag = a contradiction where new data undercuts a prior decision/assumption.
type ProposalSeverity = "act" | "review" | "flag";
interface Proposal {
  severity: ProposalSeverity;
  what: string; // one line: the action
  why: string;  // one line: the evidence
}

interface ProposalCtx {
  hotLeads: HotLead[];
  overuseFlags: OveruseFlags;
  escalations: Array<{ url: string; ai_assessment: string | null }>;
  activePaid: number; // active (not trialing) pro+team subs
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProposals(supabase: any, ctx: ProposalCtx): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const [
    outreachSent7dRes,
    outreachOverdueRes,
    outreachTopFitPendingRes,
    nurturePendingRes,
    analyticsAllTimeRes,
    planGen7dRes,
  ] = await Promise.all([
    supabase.from("outreach_log").select("id", { count: "exact", head: true }).not("sent_at", "is", null).gte("sent_at", since7d),
    supabase.from("outreach_log").select("id", { count: "exact", head: true }).is("sent_at", null).lte("next_action_due", today),
    supabase.from("outreach_log").select("id", { count: "exact", head: true }).eq("status", "pending").eq("fit_tier", "★★★"),
    supabase.from("nurture_drafts").select("trigger_type, link_id").eq("status", "pending"),
    supabase.from("analytics_events").select("id", { count: "exact", head: true }),
    supabase.from("plan_generations").select("id", { count: "exact", head: true }).gte("created_at", since7d),
  ]);

  const outreachSent7d = outreachSent7dRes.count ?? 0;
  const overdue = outreachOverdueRes.count ?? 0;
  const topFitPending = outreachTopFitPendingRes.count ?? 0;
  const analyticsAllTime = analyticsAllTimeRes.count ?? 0;
  const planGen7d = planGen7dRes.count ?? 0;

  // Drop demo/test portals from the nurture count (same exclusion as hot leads).
  const nurturePendingRaw = (nurturePendingRes.data ?? []) as Array<{ trigger_type: string; link_id: string }>;
  const nurtLinkIds = [...new Set(nurturePendingRaw.map(r => r.link_id).filter(Boolean))];
  let nurtDemoLinkIds = new Set<string>();
  if (nurtLinkIds.length) {
    const { data: nls } = await supabase
      .from("shared_links")
      .select("id, slug")
      .in("id", nurtLinkIds);
    nurtDemoLinkIds = new Set(
      ((nls ?? []) as Array<{ id: string; slug: string | null }>)
        .filter(isDemoLink)
        .map(l => l.id),
    );
  }
  const nurturePending = nurturePendingRaw.filter(r => !nurtDemoLinkIds.has(r.link_id));

  // ACT — warm buyers showing portal intent (highest priority)
  if (ctx.hotLeads.length > 0) {
    const top = ctx.hotLeads[0];
    proposals.push({
      severity: "act",
      what: `Call ${ctx.hotLeads.length} hot lead${ctx.hotLeads.length > 1 ? "s" : ""} today — start with ${top.label}.`,
      why: `${top.next_action} (${top.events_7d} portal event${top.events_7d !== 1 ? "s" : ""} in 7d).`,
    });
  }

  // ACT — legal escalations needing review
  if (ctx.escalations.length > 0) {
    proposals.push({
      severity: "act",
      what: `Review ${ctx.escalations.length} HIGH legal-watch diff${ctx.escalations.length > 1 ? "s" : ""}.`,
      why: (ctx.escalations[0].ai_assessment ?? ctx.escalations[0].url).slice(0, 160),
    });
  }

  // Outreach cadence. While intentionally paused, never read as "resume now":
  // downgrade to a REVIEW status note that states the queued counts as a holding
  // position, not a to-do. Only when un-paused do 0-sends + a loaded pipeline
  // become an ACT-TODAY item (contradicting the standing "outreach now" call).
  if (OUTREACH_PAUSED) {
    if (topFitPending > 0 || overdue > 0) {
      proposals.push({
        severity: "review",
        what: `Outreach paused — ${topFitPending} ★★★-fit prospect${topFitPending !== 1 ? "s" : ""} queued for after restart.`,
        why: `On hold until product-led copy rewrite + LinkedIn verification + CAN-SPAM address clear; ${overdue} past-due item${overdue !== 1 ? "s" : ""} hold in the queue — no action needed until the gates lift.`,
      });
    }
  } else if (outreachSent7d === 0 && (overdue > 0 || topFitPending > 0)) {
    proposals.push({
      severity: "act",
      what: `Resume builder outreach today — the pipeline is stalled.`,
      why: `0 sent in 7d · ${overdue} action${overdue !== 1 ? "s" : ""} overdue · ${topFitPending} ★★★-fit prospect${topFitPending !== 1 ? "s" : ""} still pending — stalls the "outreach now" GTM call.`,
    });
  } else if (overdue > 0) {
    proposals.push({
      severity: "review",
      what: `Clear ${overdue} overdue outreach action${overdue !== 1 ? "s" : ""}.`,
      why: `${overdue} row${overdue !== 1 ? "s" : ""} have next_action_due ≤ today with no send logged.`,
    });
  }

  // REVIEW — warm-buyer nurture drafts waiting for the builder to send
  if (nurturePending.length > 0) {
    const byType = nurturePending.reduce<Record<string, number>>((m, d) => {
      m[d.trigger_type] = (m[d.trigger_type] ?? 0) + 1;
      return m;
    }, {});
    const breakdown = Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(", ");
    proposals.push({
      severity: "review",
      what: `Review & send ${nurturePending.length} pending buyer nurture draft${nurturePending.length > 1 ? "s" : ""}.`,
      why: `Warm-buyer follow-ups sitting in nurture_drafts (${breakdown}).`,
    });
  }

  // REVIEW — monetization: accounts near plan limit / Team fair-use
  if (ctx.overuseFlags.nearLimit.length > 0) {
    proposals.push({
      severity: "review",
      what: `Nudge ${ctx.overuseFlags.nearLimit.length} account${ctx.overuseFlags.nearLimit.length > 1 ? "s" : ""} near plan limit toward an upgrade.`,
      why: ctx.overuseFlags.nearLimit.slice(0, 3).map(f => `${f.email} ${f.current}/${f.limit}`).join("; ") + ".",
    });
  }
  if (ctx.overuseFlags.teamHighUsage.length > 0) {
    proposals.push({
      severity: "review",
      what: `Fair-use review: ${ctx.overuseFlags.teamHighUsage.length} Team account${ctx.overuseFlags.teamHighUsage.length > 1 ? "s" : ""} ≥250 gen/mo.`,
      why: ctx.overuseFlags.teamHighUsage.slice(0, 3).map(f => `${f.email} ${f.current} gen`).join("; ") + ".",
    });
  }

  // FLAG — seat-sharing risk (same business domain, 2+ accounts)
  if (ctx.overuseFlags.multiDomains.length > 0) {
    proposals.push({
      severity: "flag",
      what: `Seat-sharing risk: ${ctx.overuseFlags.multiDomains.length} business domain${ctx.overuseFlags.multiDomains.length > 1 ? "s" : ""} with 2+ accounts.`,
      why: ctx.overuseFlags.multiDomains.slice(0, 3).map(f => `@${f.domain} ×${f.count}`).join("; ") + ".",
    });
  }

  // FLAG — analytics_events empty undercuts the shipped P0 funnel-log assumption
  if (analyticsAllTime === 0) {
    proposals.push({
      severity: "flag",
      what: `Verify funnel instrumentation — analytics_events is empty.`,
      why: `0 rows all-time despite the P0 server funnel-log shipping; any KPI sourced from analytics_events is currently blind.`,
    });
  }

  // FLAG — paying accounts idle = churn risk
  if (ctx.activePaid > 0 && planGen7d === 0) {
    proposals.push({
      severity: "flag",
      what: `${ctx.activePaid} paid account${ctx.activePaid > 1 ? "s" : ""} generated 0 plans in 7d — engagement/churn risk.`,
      why: `No plan_generations in 7d while paying — reach out before the renewal date.`,
    });
  }

  const rank: Record<ProposalSeverity, number> = { act: 0, review: 1, flag: 2 };
  return proposals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ── Research & Audit (external web intelligence) ─────────────────────────────
// Best-effort: collects SplanAI-relevant articles via the Anthropic web_search
// server tool, audits each on R/C/N/A (relevance/credibility/novelty/actionability),
// returns the top picks + rejection notes. FULLY guarded — any failure returns
// {result:null,error} and never breaks the rest of the brief. The brief proposes;
// the founder decides what to act on (nothing is implemented automatically).
async function fetchResearchAndAudit(
  apiKey: string,
): Promise<{ result: ResearchResult | null; error: string | null }> {
  try {
    const anthropic = new Anthropic({ apiKey, timeout: 90_000 });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const prompt = `あなたはSplanAIのためのリサーチ＆監査エージェントです。web_searchツールを使い、SplanAIに役立つ最新記事を収集し、厳格に監査して、最後にJSONだけを返してください。

SplanAI = 米国の中小ホームビルダー（年10〜50棟）向けのAI営業ツール。土地条件から30秒で3つのフロアプラン＋PDFを生成。ソロファウンダー、build-in-public、https://splanai.com 。

今日: ${today}

## 手順
1. 収集: web_searchで直近7日を優先し、次の観点からSplanAIに役立つ記事を探す（英語ソース可、合計10〜20候補）:
   - 米ホームビルダー / 住宅建設市場の動向（小規模ビルダー、住宅着工、金利・資材コスト）
   - proptech / 不動産テックのプロダクト・資金調達・市場ニュース
   - 建設・設計・フロアプランのAI（競合・隣接プロダクト）
   - SaaS成長 / build-in-public / ソロファウンダーのGTM・価格・ローンチ
   - Anthropic Claude API / LLM のプロダクト更新（技術スタックに関係するもの）
   - 不動産・建設の規制・業界団体（NAR / NAHB / NAHREP）
2. 監査: 各候補を R(関連性) C(信頼性) N(新規性) A(実行可能性) 各0〜5で批判的に採点。関連性3未満 / 宣伝・低品質SEO / 内容の薄い有料壁 / 重複 / 公開30日超 は却下。生き残った上位5本のみ採用。
3. 出力: 収集と監査が終わったら、結果を **submit_research ツール** に渡して提出する。テキストでJSONや説明文を書かないこと（ツール呼び出しのみで完了する）。

## submit_research に渡すフィールド（このスキーマ厳守）
{
  "items": [
    {
      "title": "記事タイトル",
      "url": "https://...",
      "source": "媒体名",
      "published": "YYYY-MM-DD または ''",
      "summary": "日本語2〜3文の要約",
      "scores": { "r": 5, "c": 4, "n": 4, "a": 3, "total": 16 },
      "whyItMatters": "SplanAIにとっての意味を1行（日本語）",
      "tag": "競合ウォッチ|GTMアイデア|技術更新|市場シグナル|コンテンツ案 のいずれか"
    }
  ],
  "rejectedNotes": [ "却下: <タイトル> — 理由", "..." ]
}
良い記事が少ない日は無理に埋めず items を少なくしてよい。`;

    // submit_research returns the audited result as STRUCTURED tool input. This
    // replaces the old "parse JSON out of the model's text" path, which broke
    // whenever a Japanese summary contained an unescaped quote/newline — the
    // cause of the recurring "Research unavailable: …JSON…" line in the brief.
    // Text JSON is kept only as a resilience fallback.
    const RESEARCH_TOOL = {
      name: "submit_research",
      description: "監査済みのリサーチ結果を構造化して提出する。収集と監査の後、必ず最後に1回だけ呼ぶ。",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                source: { type: "string" },
                published: { type: "string" },
                summary: { type: "string" },
                scores: {
                  type: "object",
                  properties: {
                    r: { type: "number" }, c: { type: "number" },
                    n: { type: "number" }, a: { type: "number" }, total: { type: "number" },
                  },
                },
                whyItMatters: { type: "string" },
                tag: { type: "string" },
              },
              required: ["title", "url"],
            },
          },
          rejectedNotes: { type: "array", items: { type: "string" } },
        },
        required: ["items"],
      },
    };

    const msg = await trackedMessage("cron/daily-brief:research", anthropic, {
      model: "claude-sonnet-5",
      max_tokens: 5000, // Sonnet 5: new tokenizer (~+30%) headroom for the submit_research structured output (was 3500 on 4-6). Ceiling only — billed per generated token.
      thinking: { type: "disabled" }, // Match prior 4-6 no-thinking behavior: predictable unattended cron, and adaptive-thinking tokens would otherwise count toward max_tokens alongside the web_search loop + submit_research output.
      // web_search (server tool) gathers sources; submit_research returns the
      // audited result. Cast: tool types not yet in the SDK's TS union.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 6 } as any,
        RESEARCH_TOOL as any,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    // Prefer the structured tool call; fall back to lenient text JSON.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUse = msg.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_research",
    ) as any;

    let parsed: ResearchResult;
    if (toolUse?.input && typeof toolUse.input === "object") {
      parsed = toolUse.input as ResearchResult;
    } else {
      const text = msg.content.map(b => (b.type === "text" ? b.text : "")).join("\n");
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { result: null, error: "research: no structured output or JSON in response" };
      try {
        parsed = JSON.parse(jsonMatch[0]) as ResearchResult;
      } catch {
        // Last-ditch: drop trailing commas, then retry once.
        parsed = JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, "$1")) as ResearchResult;
      }
    }

    // Invariant guard (documents the contract + protects future refactors):
    // both paths above set `parsed` to a non-null object, but assert it before use.
    if (!parsed || typeof parsed !== "object") {
      throw new Error("research: parsed result is not an object");
    }

    // Sonnet 5's structured output occasionally returns `items`/`rejectedNotes`
    // as a non-array — a JSON-encoded string, a truncated blob, or an object.
    // `?? []` only guards null/undefined, so a string slipped through and
    // `.slice()` silently returned an 8-char string, later crashing the ENTIRE
    // brief (email + LINE + KPI) at `research.items.map(...)` (incident
    // 2026-07-07, cron 500 → no morning LINE). Coerce defensively: recover a
    // stringified array when possible, else fall back to [] so the brief still
    // ships (research section degrades to "none today" instead of a 500). Log the
    // real shape + source so the prompt/tool can be tightened if content drops.
    const asArray = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string" && v.trim()) {
        try { const p: unknown = JSON.parse(v); if (Array.isArray(p)) return p; } catch { /* not JSON */ }
      }
      return [];
    };
    const rawParsed = parsed as { items?: unknown; rejectedNotes?: unknown };
    if (!Array.isArray(rawParsed.items) || !Array.isArray(rawParsed.rejectedNotes)) {
      // stop=max_tokens ⇒ the submit_research output was truncated (Sonnet 5 is
      // more verbose); that's the likely reason content degrades to []. Surfacing
      // it here makes the fix vs. a max_tokens bump a data-driven follow-up.
      console.error(
        `[daily-brief] research shape coerced (src=${toolUse ? "tool_use" : "text-json"}, ` +
        `stop=${(msg as { stop_reason?: string | null }).stop_reason ?? "?"}): ` +
        `items=${Object.prototype.toString.call(rawParsed.items)} ` +
        `notes=${Object.prototype.toString.call(rawParsed.rejectedNotes)}`,
      );
    }
    parsed.items = (asArray(rawParsed.items) as ResearchItem[]).slice(0, 8);
    parsed.rejectedNotes = asArray(rawParsed.rejectedNotes)
      .filter((n): n is string => typeof n === "string")
      .slice(0, 6);
    return { result: parsed, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[daily-brief] research error:", error);
    return { result: null, error };
  }
}

async function dailyBriefHandler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isDiag = req.nextUrl.searchParams.get("diag") === "1";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const todayJST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD

  // Idempotency: skip if already ran today (bypassed when ?diag=1)
  const { data: existing } = await supabase
    .from("daily_brief_log")
    .select("id, sent_at")
    .eq("run_date", todayJST)
    .maybeSingle();
  if (!isDiag && existing?.sent_at) {
    return NextResponse.json({ ok: true, skipped: "already_ran", date: todayJST });
  }

  const logId = existing?.id ?? null;

  // ── 1. Gmail: fetch inbox threads from last 24h ──────────────────────────
  const threads: EmailThread[] = [];
  let gmailError: string | null = null;
  let diagAccount: string | null = null;
  let diagQuery: string | null = null;
  let diagRawThreads: number | null = null;

  const gmailConfigured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN;

  if (gmailConfigured) {
    try {
      const gmail = getGmailClient();

      if (isDiag) {
        const profile = await gmail.users.getProfile({ userId: "me" });
        diagAccount = profile.data.emailAddress ?? null;
        console.log("[diag] account:", diagAccount, "| messagesTotal:", profile.data.messagesTotal);
        console.log("[diag] INBOX_EMAIL (constant) =", INBOX_EMAIL);
        diagQuery = `in:inbox newer_than:1d to:${INBOX_EMAIL}`;
        console.log("[diag] query =", diagQuery);
      }

      const listRes = await gmail.users.threads.list({
        userId: "me",
        q: `in:inbox newer_than:1d to:${INBOX_EMAIL}`,
        maxResults: 30,
      });

      if (isDiag) {
        diagRawThreads = listRes.data.threads?.length ?? 0;
        console.log("[diag] raw threads before noise filter:", diagRawThreads);
      }

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

  const [subsResult, financeResult, portalViewsResult, newSignupsResult, newPortalLeadsResult, outreachSentResult, outreachRepliedResult, newGenerationsResult, hotLeads, overuseFlags] = await Promise.all([
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
    supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .gte("created_at", since24h),
    supabase
      .from("portal_leads")
      .select("id", { count: "exact" })
      .gte("created_at", since24h),
    supabase
      .from("outreach_log")
      .select("id", { count: "exact" })
      .not("sent_at", "is", null)
      .gte("sent_at", since24h),
    supabase
      .from("outreach_log")
      .select("id", { count: "exact" })
      .not("replied_at", "is", null)
      .gte("replied_at", since24h),
    supabase
      .from("plan_generations")
      .select("id", { count: "exact" })
      .gte("created_at", since24h),
    fetchHotLeads(supabase),
    fetchOveruseFlags(supabase),
  ]);

  const todaySnap = financeResult.data?.[0];
  const prevSnap = financeResult.data?.[1];
  const mrr = todaySnap?.mrr ?? 0;
  const mrrPrev = prevSnap?.mrr ?? 0;
  const mrrDelta = mrr - mrrPrev;

  // Portal opens in last 24h
  const portalViewCount = portalViewsResult.count ?? 0;

  const newSignups = newSignupsResult.count ?? 0;
  const newPortalLeads = newPortalLeadsResult.count ?? 0;
  const outreachSent = outreachSentResult.count ?? 0;
  const outreachReplied = outreachRepliedResult.count ?? 0;
  const newGenerations = newGenerationsResult.count ?? 0;

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

  // ── 2b. Proposals: signal-bound action items + reconsider flags ──────────
  const activePaid = ((subsResult.data ?? []) as Array<{ plan: string; status: string }>)
    .filter(s => s.status === "active" && (s.plan === "pro" || s.plan === "team")).length;
  const proposals = await fetchProposals(supabase, {
    hotLeads: hotLeads ?? [],
    overuseFlags: overuseFlags ?? { nearLimit: [], teamHighUsage: [], multiDomains: [] },
    escalations: escalations ?? [],
    activePaid,
  });

  // ── 3. Claude API: classify + draft + X posts ────────────────────────────
  let claudeResult: ClauseResult = { drafts: [], xPosts: [] };
  let claudeError: string | null = null;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // ── 3b. Research & Audit: start concurrently so its web searches overlap the
  // Haiku triage + DB persistence below (kept off the critical path). Awaited
  // just before the HTML is built.
  const researchPromise: Promise<{ result: ResearchResult | null; error: string | null }> =
    anthropicKey
      ? fetchResearchAndAudit(anthropicKey)
      : Promise.resolve({ result: null, error: "ANTHROPIC_API_KEY not set" });
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
Angles: roi=the time/cost economics of proposals for builders (qualitative — describe the dynamic, no invented numbers), feature=product feature highlight (existing features only), use_case=builder workflow, market_insight=housing market data (only with a real named source), social_proof=what builders say about the PROBLEM (never invented testimonials or traction numbers), founder=personal founder story, behind_scenes=build-in-public (what I'm actually working on)

Truthfulness rules (STRICT — a post that breaks any of these is auto-rejected before publishing):
- NEVER invent customer results, metrics, or adoption numbers. No "one builder went from X to Y", no "cut N hours to M", no "N% faster/more", no customer counts, deals closed, or ROI numbers. SplanAI has NO citable customer results yet.
- NEVER claim a feature was "just shipped" / "just launched" / "now live". Do not announce launches at all — a human announces launches.
- NEVER cite a study, survey, or statistic unless it comes from a real named source you were given, with the source named in the post.
- No fake testimonials, no invented quotes, no implied traction.

Voice rules (STRICT):
- Write as the solo founder in first person ("I"). Refer to the product in third person as "SplanAI" — never "we".
- ZERO hashtags. No emoji spam.
- Plain English, builder-to-builder tone. No marketing hype.
- NEVER use these words/phrases: ${BANNED_WORDS.map(w => `"${w}"`).join(", ")}, "seamless", "effortless", "unlock", "empower".
- Max 280 chars each.

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
      const msg = await trackedMessage("cron/daily-brief:xpost", anthropic, {
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

  const { result: researchResult, error: researchError } = await researchPromise;

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
    newSignups,
    newPortalLeads,
    newGenerations,
    outreachSent,
    outreachReplied,
    threads,
    actionableThreads: leadsAndSupport,
    drafts: claudeResult.drafts,
    xPosts: claudeResult.xPosts,
    escalations: escalations ?? [],
    hotLeads: hotLeads ?? [],
    overuseFlags: overuseFlags ?? { nearLimit: [], teamHighUsage: [], multiDomains: [] },
    proposals,
    gmailError,
    claudeError,
    research: researchResult,
    researchError,
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
    new_signups: newSignups,
    new_portal_leads: newPortalLeads,
    new_generations: newGenerations,
    outreach_sent: outreachSent,
    outreach_replied: outreachReplied,
    sent_at: sendError ? null : new Date().toISOString(),
    error: sendError ? JSON.stringify(sendError) : (gmailError ?? claudeError ?? null),
  };

  if (logId) {
    await supabase.from("daily_brief_log").update(logPayload).eq("id", logId);
  } else {
    await supabase.from("daily_brief_log").insert(logPayload);
  }

  // ── 6a. R5 heartbeat: record THIS run before the Cron-health fetch below so
  // the brief's own row is always fresh at read time (no false 24h-stale
  // self-flag from runtime jitter). A send failure records last_error while
  // preserving last_ok, so liveness and errors stay independent signals.
  await recordHeartbeat(
    "daily-brief",
    sendError
      ? { ok: false, error: `email send failed: ${JSON.stringify(sendError).slice(0, 300)}` }
      : { ok: true },
  );

  // ── 6b. LINE: push the comprehensive daily report (Phase 1) ─────────────────
  // In-process push (no self-HTTP to /api/line/*) so the Vercel WAF bot-challenge
  // never applies to delivery. Best-effort: any LINE failure is logged and never
  // affects the email or the run log. Phase 1 = info-only daily report (KPI +
  // last night's X/FB posts + today's published blog, all translated to Japanese,
  // + a NO-button research carousel). Approve/reject buttons are intentionally NOT
  // shown here — that is Phase 2 (knowledge-loop). The richer email above remains
  // the detailed source of truth and is untouched.
  let linePushed = false;
  try {
    // Posted content is pulled by post time (NOT run_date) over a 20h window so
    // the 07:00 JST brief captures everything published the previous night —
    // blog 21:30 / X 22:10 & 03:40 / FB 01:20 JST — without re-reporting the day
    // before. Uses the verified columns: posted_at / published_at (timestamptz).
    const since20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

    const [xPostedRes, fbPostedRes, blogPublishedRes] = await Promise.all([
      supabase
        .from("x_post_draft")
        .select("angle, draft_text, posted_at")
        .eq("status", "posted")
        .gte("posted_at", since20h)
        .order("posted_at", { ascending: true }),
      supabase
        .from("fb_post_draft")
        .select("message, posted_at")
        .eq("status", "posted")
        .gte("posted_at", since20h)
        .order("posted_at", { ascending: true }),
      supabase
        .from("seo_articles")
        .select("title, slug, draft_content, published_at")
        .eq("status", "published")
        .gte("published_at", since20h)
        .order("published_at", { ascending: false })
        .limit(1),
    ]);

    const xPosted = (xPostedRes.data ?? []) as Array<{ angle: string | null; draft_text: string | null }>;
    const fbPosted = (fbPostedRes.data ?? []) as Array<{ message: string | null }>;
    const blog = (blogPublishedRes.data?.[0] ?? null) as { title: string | null; slug: string | null; draft_content: string | null } | null;

    // ── Translation (Anthropic Haiku, best-effort) ───────────────────────────
    // Short posts (each X + FB) are translated together in ONE request returning
    // strict JSON [{"i":0,"ja":"..."}]; the blog body is a separate full-text
    // request. Never throws — on missing key / failure the original text is used
    // with a "(翻訳失敗)" marker so the brief is never blocked.
    const shortOriginals: string[] = [
      ...xPosted.map(x => x.draft_text ?? ""),
      ...(fbPosted[0]?.message != null ? [fbPosted[0].message] : []),
    ];
    const shortJa: string[] = shortOriginals.map(o => `${o}\n(翻訳失敗)`);

    if (anthropicKey && shortOriginals.length > 0) {
      try {
        const anthropicLine = new Anthropic({ apiKey: anthropicKey });
        const numbered = shortOriginals.map((o, i) => `[${i}] ${o}`).join("\n\n");
        const tmsg = await trackedMessage("cron/daily-brief:translate-short", anthropicLine, {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `次の英語の投稿文をそれぞれ自然な日本語に全文翻訳してください。出力は厳格なJSON配列のみ（説明・マークダウン・コードフェンス禁止）。形式: [{"i":0,"ja":"訳文"}]。各原文は番号[i]付き。\n\n${numbered}`,
          }],
        });
        const raw = tmsg.content.map(b => (b.type === "text" ? b.text : "")).join("\n");
        const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "");
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const parsed = JSON.parse(arrMatch[0]) as Array<{ i: number; ja: string }>;
          for (const r of parsed) {
            if (typeof r?.i === "number" && r.i >= 0 && r.i < shortJa.length && typeof r.ja === "string" && r.ja.trim()) {
              shortJa[r.i] = r.ja.trim();
            }
          }
        }
      } catch (err) {
        console.error("[daily-brief] LINE short translation error:", err instanceof Error ? err.message : String(err));
      }
    }

    const xJa = xPosted.map((_, i) => shortJa[i]);
    const fbJa = fbPosted[0]?.message != null ? shortJa[xPosted.length] : null;

    let blogJa: string | null = null;
    if (blog?.draft_content) {
      blogJa = `${blog.draft_content}\n(翻訳失敗)`;
      if (anthropicKey) {
        try {
          const anthropicBlog = new Anthropic({ apiKey: anthropicKey });
          const bmsg = await trackedMessage("cron/daily-brief:translate-blog", anthropicBlog, {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: `次の英語のブログ記事本文を自然な日本語に全文翻訳してください。出力は訳文のみ（説明・前置き・マークダウンの追加禁止、本文の構造は保持）。\n\n${blog.draft_content}`,
            }],
          });
          const btext = bmsg.content.map(b => (b.type === "text" ? b.text : "")).join("\n").trim();
          if (btext) blogJa = btext;
        } catch (err) {
          console.error("[daily-brief] LINE blog translation error:", err instanceof Error ? err.message : String(err));
        }
      }
    }

    // ── R5: ⚠ Cron health (small section appended to msg1) ───────────────────
    // Reads cron_heartbeats and lists any instrumented cron whose last_ok is
    // >24h old or which carries a last_error; single green line when healthy.
    // Never blocks the brief — a fetch failure is shown as its own warning line.
    let cronHealthText: string;
    try {
      const { data: hbRows, error: hbError } = await supabase
        .from("cron_heartbeats")
        .select("job, last_ok, last_error");
      if (hbError) throw new Error(hbError.message);
      const rows = (hbRows ?? []) as Array<{ job: string; last_ok: string | null; last_error: string | null }>;
      const DAY_MS = 24 * 60 * 60 * 1000;
      // Per-job staleness: weekly crons must not trip the daily 24h rule every
      // day (alert fatigue). Threshold = cadence + 1 day grace; default 24h.
      const STALE_MS_BY_JOB: Record<string, number> = {
        "pulse-refresh": 8 * DAY_MS, // weekly (Thu 18:00 UTC, vercel.json)
      };
      const issues: string[] = [];
      for (const r of [...rows].sort((a, b) => a.job.localeCompare(b.job))) {
        const ageMs = r.last_ok ? Date.now() - new Date(r.last_ok).getTime() : null;
        const parts: string[] = [];
        if (ageMs == null) parts.push("成功実績なし");
        else if (ageMs > (STALE_MS_BY_JOB[r.job] ?? DAY_MS)) parts.push(`last ok ${Math.floor(ageMs / 3_600_000)}h前`);
        // W1: ok+warn heartbeats (e.g. link-integrity holds) carry a "WARN "
        // prefix in last_error — render as WARN, not ERR (intentional hold).
        if (r.last_error) {
          const issue = parseHeartbeatIssue(r.last_error.replace(/\s+/g, " "));
          parts.push(`${issue.level === "warn" ? "WARN" : "ERR"} ${issue.message.slice(0, 60)}`);
        }
        if (parts.length > 0) issues.push(`・${r.job}: ${parts.join(" / ")}`);
      }
      cronHealthText = issues.length > 0
        ? `⚠ Cron health\n${issues.join("\n")}`
        : `✅ Cron正常（${rows.length} jobs）`;
    } catch (err) {
      cronHealthText = `⚠ Cron health取得失敗: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`;
    }

    // ── W0/W4: 💸 API Cost (MTD) + ⚠️ Errors (24h) ───────────────────────────
    // Built from cron_costs / error_events (src/lib/observability.ts). Passive
    // record layer — reads only, adds no metered spend. Best-effort: any failure
    // yields a short notice and never blocks the brief. A threshold breach (MTD >
    // 閾値, 前日 ≥ 日次閾値 [zero-baseline safety net], 前日比2倍超, or ≥N errors/24h)
    // prepends 🚨 so this same LINE push doubles as the cost/error alert — W0 and
    // W4 share the brief's LINE path (no new push). A Supabase read failure renders
    // 取得失敗 (fail-loud), never a healthy-looking $0/0件.
    let costErrorText: string;
    try {
      const [cost, errs] = await Promise.all([
        getCostSummary(supabase),
        getErrorSummary(supabase),
      ]);
      const warnings = [...cost.warnings, ...errs.warnings];
      const alert = warnings.length > 0 ? `🚨 ${warnings.join(" / ")}\n` : "";
      // Fail-loud: a Supabase read failure (migration/RLS/query) renders as 取得失敗,
      // NEVER a healthy-looking $0 / 0件 — a read error that reads as "all clear"
      // is exactly the false-green this record layer exists to prevent.
      const costPart = cost.error
        ? `⚠️ API Cost取得失敗（${cost.error.slice(0, 80)}）`
        : `💸 API Cost (MTD)\n` +
          `Anthropic概算 $${cost.mtdUsd}（前日 $${cost.yesterdayUsd} / 前々日 $${cost.dayBeforeUsd}）\n` +
          `外部API ${cost.externalCount}件・Apollo ${cost.apolloCredits}\n` +
          `内訳: ${cost.topJobs.length ? cost.topJobs.map(j => `${j.job.replace(/^cron\//, "")} $${j.usd}`).join("・") : "なし"}`;
      const errPart = errs.error
        ? `⚠️ Errors取得失敗（${errs.error.slice(0, 80)}）`
        : `⚠️ Errors(24h) ${errs.count}件${errs.count > 0 ? ` — ${errs.topRoutes.map(r => `${r.route.replace(/^cron\//, "")} ${r.n}`).join("・")}` : ""}`;
      costErrorText = `${alert}${costPart}\n${errPart}`;
    } catch (err) {
      costErrorText = `💸/⚠️ Cost/Error取得失敗: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`;
    }

    // ── Assemble messages (only present sections · max 4) ────────────────────
    // msg1: KPI summary (always sent).
    const msg1 = {
      type: "text",
      text:
        `📊 SplanAI デイリー ${todayJST}\n` +
        `MRR $${mrr}（前日 ${mrrDelta >= 0 ? `+$${mrrDelta}` : `-$${Math.abs(mrrDelta)}`}）\n` +
        `新規登録 ${newSignups}｜ポータル閲覧 ${portalViewCount}（uniq ${uniquePortalCount}）｜生成 ${newGenerations}\n` +
        `アウトリーチ 送信${outreachSent}/返信${outreachReplied}\n` +
        `🔥ホットリード ${(hotLeads ?? []).length}件｜⚠️エスカレ ${escalations?.length ?? 0}件\n` +
        cronHealthText + "\n" +
        costErrorText,
    };

    // msg2: last night's auto-posts (original → Japanese). "なし" line if empty.
    let msg2: { type: "text"; text: string };
    if (xPosted.length === 0 && fbPosted.length === 0) {
      msg2 = { type: "text", text: "📣 昨夜の自動投稿なし" };
    } else {
      const parts: string[] = ["📣 昨夜の自動投稿"];
      xPosted.forEach((x, i) => {
        parts.push(`【X/${x.angle ?? "post"}】${x.draft_text ?? ""}\n→ ${xJa[i]}`);
      });
      if (fbPosted[0]?.message != null) {
        parts.push(`【FB】${fbPosted[0].message}\n→ ${fbJa}`);
      }
      msg2 = { type: "text", text: parts.join("\n\n") };
    }

    // msg3: today's published blog (translated). Truncated at 4800 chars (LINE
    // text limit 5000) with a "continue →" link. Omitted when nothing published.
    let msg3: { type: "text"; text: string } | null = null;
    if (blog && blogJa) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
      let blogText = `📝 本日公開ブログ\n${blog.title ?? ""}\n\n${blogJa}`;
      if (blogText.length > 5000) {
        blogText = `${blogText.slice(0, 4800)}\n\n…（続き→ ${appUrl}/blog/${blog.slug ?? ""}）`;
      }
      msg3 = { type: "text", text: blogText };
    }

    // msg4: information-only research carousel (NO approve/reject). Omitted empty.
    const researchItems = researchResult?.items ?? [];
    const msg4 = researchItems.length > 0
      ? buildNewsCarousel(
          researchItems.map(it => ({
            title: it.title,
            url: it.url,
            summary: it.summary,
            whyItMatters: it.whyItMatters,
            tag: it.tag,
            score: Number.isFinite(it.scores?.total) ? it.scores.total : null,
          })),
          todayJST,
        )
      : null;

    // msg5 (Phase 2): knowledge-loop approval carousel. Reads only the pending
    // proposals that the local launchd job (splanai-kloop-propose) inserted with
    // source='knowledge-loop'. These are the ONLY bubbles that carry approve/
    // reject/hold buttons (info-only research msg4 has none). Omitted when there
    // is nothing pending so the brief still fits LINE's 5-message ceiling.
    let msg5: object | null = null;
    const { data: kloopRows } = await supabase
      .from("line_proposals")
      .select("token, title, url, why_it_matters, action_tag, score")
      .eq("source", "knowledge-loop")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(12);
    if (kloopRows && kloopRows.length > 0) {
      msg5 = buildDigestCarousel(
        kloopRows as DigestProposal[],
        process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com",
        todayJST,
        null,
      );
    }

    const messages = [msg1, msg2, msg3, msg4, msg5].filter(Boolean) as object[];
    const line = await pushMessages(messages);
    linePushed = line.ok;
    if (!line.ok) {
      console.error("[daily-brief] LINE push failed:", line.status, line.body.slice(0, 200));
    }
  } catch (err) {
    console.error("[daily-brief] LINE block error:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({
    ok: true,
    date: todayJST,
    threadsFound: threads.length,
    leadsFound: leadCount,
    xPostsCreated: claudeResult.xPosts.length,
    emailSent: !sendError,
    linePushed,
    gmailConfigured: !!gmailConfigured,
    ...(isDiag ? { diag: { account: diagAccount, query: diagQuery, rawThreads: diagRawThreads } } : {}),
  });
}

// R5 cron heartbeat — crash-only wrapper; the handler above is unchanged.
// Success/send-failure is recorded INLINE at step 6a (so the health section can
// read a fresh row); this wrapper only catches an otherwise-unrecorded crash.
export async function GET(req: NextRequest) {
  try {
    return await dailyBriefHandler(req);
  } catch (err) {
    await recordHeartbeat("daily-brief", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    await recordError("cron/daily-brief", 500, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : null);
    throw err;
  }
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
  newSignups: number;
  newPortalLeads: number;
  newGenerations: number;
  outreachSent: number;
  outreachReplied: number;
  threads: EmailThread[];
  actionableThreads: ClauseResult["drafts"];
  drafts: ClauseResult["drafts"];
  xPosts: ClauseResult["xPosts"];
  escalations: Array<{ id: string; url: string; impact_level: string | null; ai_assessment: string | null }>;
  hotLeads: HotLead[];
  overuseFlags: OveruseFlags;
  proposals: Proposal[];
  gmailError: string | null;
  claudeError: string | null;
  research: ResearchResult | null;
  researchError: string | null;
}

function buildProposalsHtml(proposals: Proposal[]): string {
  if (!proposals.length) {
    return `<p style="color:#6b7280;font-size:13px;">No proposals — no threshold-crossing signals across funnel / outreach / nurture / generations in the last 24h–7d.</p>`;
  }
  const meta: Record<ProposalSeverity, { label: string; bg: string; fg: string; border: string }> = {
    act:    { label: "ACT TODAY",  bg: "#dcfce7", fg: "#166534", border: "#22c55e" },
    review: { label: "REVIEW",     bg: "#dbeafe", fg: "#1e40af", border: "#3b82f6" },
    flag:   { label: "RECONSIDER", bg: "#fef9c3", fg: "#854d0e", border: "#eab308" },
  };
  return proposals.map(p => {
    const m = meta[p.severity];
    return `
    <div style="border:1px solid #e5e7eb;border-left:4px solid ${m.border};border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fff;">
      <div style="margin-bottom:5px;">
        <span style="background:${m.bg};color:${m.fg};font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">${m.label}</span>
      </div>
      <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#111827;">${p.what}</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">${p.why}</p>
    </div>`;
  }).join("");
}

function buildHotLeadsHtml(hotLeads: HotLead[]): string {
  if (!hotLeads.length) return `<p style="color:#6b7280;font-size:13px;">No hot leads this week.</p>`;
  return hotLeads.map(l => {
    const loc = [l.city, l.state].filter(Boolean).join(", ");
    const badges: string[] = [];
    if (l.prequal_clicks >= 1) badges.push(`<span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">⚡ Pre-qual started</span>`);
    if (l.plan_selects >= 1) badges.push(`<span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">✓ Plan selected</span>`);
    if (l.pdf_downloads >= 1) badges.push(`<span style="background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">↓ PDF</span>`);
    return `
    <div style="border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fff7f7;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">HOT</span>
        <span style="font-size:14px;font-weight:700;color:#111827;">${l.label}</span>
        ${loc ? `<span style="font-size:12px;color:#6b7280;">${loc}</span>` : ""}
      </div>
      <p style="margin:0 0 6px;font-size:13px;color:#1d4ed8;font-weight:600;">${l.next_action}</p>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${badges.join("")}
        <span style="font-size:12px;color:#6b7280;">${l.events_7d} event${l.events_7d !== 1 ? "s" : ""} this week</span>
        <a href="https://splanai.com/s/${l.slug}" style="font-size:12px;color:#3b82f6;text-decoration:none;margin-left:auto;">View portal →</a>
      </div>
    </div>`;
  }).join("");
}

function buildOveruseFlagsHtml(flags: OveruseFlags): string {
  const hasAny = flags.nearLimit.length > 0 || flags.teamHighUsage.length > 0 || flags.multiDomains.length > 0;
  if (!hasAny) return `<p style="color:#6b7280;font-size:13px;">No overuse flags today.</p>`;

  const rows: string[] = [];

  if (flags.nearLimit.length > 0) {
    rows.push(`<p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">A · Near plan limit (≥80%)</p>`);
    rows.push(...flags.nearLimit.map(f =>
      `<div style="border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:4px;background:#fffbeb;">
        <span style="font-size:13px;color:#111827;">${f.email}</span>
        <span style="margin-left:8px;font-size:11px;color:#6b7280;">${f.plan.toUpperCase()} · ${f.current}/${f.limit} (${Math.round(f.current/f.limit*100)}%)</span>
      </div>`
    ));
  }

  if (flags.teamHighUsage.length > 0) {
    rows.push(`<p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:12px 0 6px;">B · Team fair-use review (≥250 gen/mo)</p>`);
    rows.push(...flags.teamHighUsage.map(f =>
      `<div style="border:1px solid #fca5a5;border-radius:6px;padding:8px 12px;margin-bottom:4px;background:#fff7f7;">
        <span style="font-size:13px;color:#111827;">${f.email}</span>
        <span style="margin-left:8px;font-size:11px;color:#6b7280;">TEAM · ${f.current} generations this month</span>
      </div>`
    ));
  }

  if (flags.multiDomains.length > 0) {
    rows.push(`<p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin:12px 0 6px;">C · Same business domain (seat-sharing risk)</p>`);
    rows.push(...flags.multiDomains.map(f =>
      `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;margin-bottom:4px;background:#f9fafb;">
        <span style="font-size:13px;font-weight:600;color:#111827;">@${f.domain}</span>
        <span style="margin-left:8px;font-size:11px;color:#6b7280;">${f.count} accounts: ${f.emails.join(', ')}</span>
      </div>`
    ));
  }

  return rows.join('');
}

function buildResearchHtml(research: ResearchResult | null, researchError: string | null): string {
  if (!research) {
    return `<p style="color:#6b7280;font-size:13px;">${researchError ? `Research unavailable: ${researchError}` : "No research run today."}</p>`;
  }
  if (!research.items.length) {
    const reviewed = research.rejectedNotes?.length
      ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">${research.rejectedNotes.length} candidate(s) reviewed — none passed audit.</p>`
      : "";
    return `<p style="color:#6b7280;font-size:13px;">監査を通過した記事は今日はありません（低品質の候補のみ）。</p>${reviewed}`;
  }
  const itemsHtml = research.items.map(it => {
    const s = it.scores ?? { r: 0, c: 0, n: 0, a: 0, total: 0 };
    const meta = [it.source, it.published].filter(Boolean).join(" · ");
    return `
    <div style="border:1px solid #e5e7eb;border-left:4px solid #6366f1;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fff;">
      <div style="margin-bottom:5px;">
        <span style="background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">${it.tag ?? "research"}</span>
        ${meta ? `<span style="margin-left:6px;font-size:11px;color:#6b7280;">${meta}</span>` : ""}
        <span style="float:right;font-size:11px;font-weight:700;color:#4f46e5;">score ${s.total}/20</span>
      </div>
      <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#111827;">
        <a href="${it.url}" style="color:#1d4ed8;text-decoration:none;">${it.title}</a>
      </p>
      <p style="margin:0 0 4px;font-size:12px;color:#374151;">${it.summary ?? ""}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#4338ca;">→ ${it.whyItMatters ?? ""}</p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">R${s.r} · C${s.c} · N${s.n} · A${s.a}</p>
    </div>`;
  }).join("");
  const notesHtml = research.rejectedNotes?.length
    ? `<div style="margin-top:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Audit Notes — 却下</p>
        ${research.rejectedNotes.map(n => `<p style="margin:0 0 2px;font-size:11px;color:#9ca3af;">• ${n}</p>`).join("")}
      </div>`
    : "";
  return itemsHtml + notesHtml;
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
    ["Plans Generated (24h)", String(p.newGenerations)],
    ["New Signups (24h)", String(p.newSignups)],
    ["Portal Leads (24h)", String(p.newPortalLeads)],
    ["Outreach Sent (24h)", String(p.outreachSent)],
    ["Outreach Replied (24h)", String(p.outreachReplied)],
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

  const researchHtml = buildResearchHtml(p.research, p.researchError);

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

      <!-- Proposals -->
      <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">💡 Proposals</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">Signal-bound only — each item fires from a crossed threshold; the second line is the data behind it.</p>
      <div style="margin-bottom:28px;">${buildProposalsHtml(p.proposals)}</div>

      <!-- KPI Snapshot -->
      <h2 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">📊 KPI Snapshot</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">${kpiHtml}</table>

      <!-- Portal Opens -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🔗 Portal Opens (24h)</h2>
      <div style="margin-bottom:28px;">${portalHtml}</div>

      <!-- Hot Leads -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🔥 Hot Leads (7d)</h2>
      <div style="margin-bottom:28px;">${buildHotLeadsHtml(p.hotLeads)}</div>

      <!-- Overuse Flags -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">⚠️ Overuse Flags</h2>
      <div style="margin-bottom:28px;">${buildOveruseFlagsHtml(p.overuseFlags)}</div>

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

      <!-- Research & Audit -->
      <h2 style="margin:28px 0 4px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;">🔎 Research &amp; Audit</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">外部Web記事を収集→監査スコア化した候補。採否はあなたが判断（気に入ったら Obsidian の <code>.raw/</code> に入れて <code>/ppp</code>）。</p>
      <div>${researchHtml}</div>

    </div>

    <div style="background:#f9fafb;padding:16px 36px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        SplanAI Auto-Secretary · <a href="https://splanai.com/dashboard" style="color:#3b82f6;text-decoration:none;">Dashboard</a>
        · Generated at 07:00 JST — nothing was auto-sent or auto-posted
      </p>
    </div>

  </div>
</body>
</html>`;
}
