// src/lib/reply-watch.ts — pure logic for /api/cron/reply-watch (W2 instant
// reply + W1 bounce breaker, DEC-0703A 2026-07-03). Kept free of I/O so every
// decision (bounce detection, classification, breaker math, prompt, LINE text)
// is unit-testable without Gmail/Supabase/LINE (src/lib/reply-watch.test.ts).

import { BANNED_WORDS } from "@/lib/content-quality";

// ── Classification ───────────────────────────────────────────────────────────

export type InboundKind = "bounce" | "noise" | "outreach_reply" | "human";

// System/automated senders that never get a reply draft. Mirrors the
// daily-brief NOISE_SENDERS list (src/app/api/cron/daily-brief/route.ts) MINUS
// mailer-daemon@ — DSNs are classified as "bounce" BEFORE this list is
// consulted, and must never be swallowed as noise.
export const NOISE_SENDERS = [
  "noreply@", "no-reply@",
  "stripe.com", "supabase.io", "supabase.com",
  "vercel.com", "resend.com", "github.com",
  "google.com", "googlealerts-noreply@", "producthunt.com",
  "anthropic.com",
  "linkedin.com", "facebook.com", "facebookmail.com",
  // DMARC rua receivers (dmarcreport@microsoft.com, noreply-dmarc-support@ …)
  // — unmonitored robot digests, never a reply target (2026-07-10)
  "dmarc",
  // Shoji's own test address
  "k10600460@gmail.com",
] as const;

// DSN (bounce) sender patterns — mailer-daemon / postmaster / MTA display names.
const BOUNCE_SENDER_RE =
  /(?:^|<|\s|")(?:mailer-daemon|postmaster|mail\s*delivery\s*(?:subsystem|system))(?:@|\s|"|>|$)/i;

// HARD-failure DSN subject patterns (Gmail, Outlook/Exchange, generic MTAs).
const BOUNCE_SUBJECT_RE =
  /undeliver|delivery\s+status\s+notification|delivery\s+(?:has\s+)?failed|failure\s+notice|returned\s+mail|mail\s+delivery\s+fail|message\s+not\s+delivered|couldn'?t\s+be\s+delivered/i;

// SOFT signals (codex review): "Delivery Status Notification (Delay)" /
// "delivery incomplete" mean the MTA is still retrying — the mail may yet
// arrive. Counting those as bounces would trip the breaker on a slow relay and
// wrongly suppress live addresses, so they are excluded outright.
const BOUNCE_SOFT_RE = /\bdelay(?:ed)?\b|delivery\s+incomplete|will\s+retry|temporar/i;

export interface BounceDetection {
  /** which signal matched, recorded into bounce_events.reason */
  reason: string;
  /** bounced recipient, when extractable from the DSN body */
  targetEmail: string | null;
}

/**
 * Detect a HARD-failure DSN (bounce). Returns null for non-bounces AND for
 * soft/delay notifications (still retrying — not a failure yet). Signals, in
 * priority order (codex review — From/Subject alone is weak):
 *   1. DSN MIME structure (multipart/report + message/delivery-status part)
 *   2. mailer-daemon/postmaster sender
 *   3. hard-failure subject
 */
export function detectBounce(input: {
  from: string;
  subject: string;
  body?: string;
  mimeTypes?: readonly string[]; // flattened part mime types (flattenMimeTypes)
}): BounceDetection | null {
  if (BOUNCE_SOFT_RE.test(input.subject)) return null;
  const mimeHit = (input.mimeTypes ?? []).some(
    m => m.toLowerCase() === "multipart/report" || m.toLowerCase().startsWith("message/delivery-status"),
  );
  const senderHit = BOUNCE_SENDER_RE.test(input.from);
  const subjectHit = BOUNCE_SUBJECT_RE.test(input.subject);
  if (!mimeHit && !senderHit && !subjectHit) return null;
  return {
    reason: mimeHit ? "dsn_mime" : senderHit ? "dsn_sender" : "dsn_subject",
    targetEmail: extractBounceTarget(input.body ?? ""),
  };
}

const EMAIL_CHARS = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";

// Ordered: structured DSN fields first, prose fallbacks last.
const BOUNCE_TARGET_PATTERNS: RegExp[] = [
  new RegExp(`X-Failed-Recipients:\\s*<?(${EMAIL_CHARS})>?`, "i"),
  new RegExp(`Final-Recipient:\\s*rfc822;\\s*<?(${EMAIL_CHARS})>?`, "i"),
  new RegExp(`Original-Recipient:\\s*rfc822;\\s*<?(${EMAIL_CHARS})>?`, "i"),
  // Gmail prose: "Your message wasn't delivered to dean@acme.com because…"
  new RegExp(`(?:wasn'?t|was\\s+not|couldn'?t\\s+be|could\\s+not\\s+be)\\s+delivered\\s+to\\s+<?(${EMAIL_CHARS})>?`, "i"),
  // qmail/exim prose: "The following address(es) failed:\n  dean@acme.com"
  new RegExp(`following\\s+address(?:\\(es\\)|es)?\\s+failed:\\s*<?(${EMAIL_CHARS})>?`, "i"),
];

/** Extract the bounced recipient from a DSN body; null when no pattern matches. */
export function extractBounceTarget(body: string): string | null {
  for (const re of BOUNCE_TARGET_PATTERNS) {
    const m = body.match(re);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

// Out-of-office / vacation autoresponders. They carry In-Reply-To (they ARE
// replies) but must never trigger a §5.5 draft + two LINE pushes.
const AUTO_REPLY_SUBJECT_RE =
  /^(?:automatic\s+reply|auto[- ]?reply|autoreply|out\s+of\s+(?:the\s+)?office|abwesenheit|自動応答)/i;

export function isAutoReply(input: { subject: string; autoSubmitted: string | null }): boolean {
  if (input.autoSubmitted && input.autoSubmitted.toLowerCase() !== "no") return true;
  return AUTO_REPLY_SUBJECT_RE.test(input.subject.trim());
}

// DMARC aggregate reports (RFC 7489 "rua" receivers: Microsoft / Google /
// Amazon SES …) are unmonitored robot digests — "Please do not respond".
// Checked BEFORE detectBounce: SES sends them from postmaster@, which
// BOUNCE_SENDER_RE would otherwise misclassify as a DSN and pollute
// bounce_events / the W1 breaker (observed in prod 2026-07-08).
const DMARC_REPORT_SUBJECT_RE = /report\s+domain\s*:|dmarc\s+aggregate/i;

export interface ClassifyInput {
  fromEmail: string; // bare address, e.g. dean@acme.com
  fromRaw: string;   // full From header, e.g. `"Mail Delivery Subsystem" <mailer-daemon@googlemail.com>`
  subject: string;
  body?: string;
  hasListUnsubscribe: boolean;
  autoSubmitted?: string | null; // Auto-Submitted header (RFC 3834) when present
  inReplyTo: string | null;   // In-Reply-To header (null/empty = fresh mail)
  knownEmails: ReadonlySet<string>; // lowercased growth_contacts.email ∪ outreach_log.contact_email
}

/**
 * Classify one inbound message. Order matters:
 *   dmarc-report (noise) → bounce → auto-reply/noise-sender
 *   → KNOWN address (outreach_reply) → List-Unsubscribe (noise)
 *   → In-Reply-To (outreach_reply) → human.
 * A known prospect address outranks List-Unsubscribe (their personal reply must
 * never be dropped as marketing), but an OOO autoresponder outranks everything
 * except bounces (it must never earn a §5.5 draft). DMARC reports outrank even
 * bounces — SES sends them from postmaster@ (a bounce-sender pattern).
 */
export function classifyInbound(input: ClassifyInput & { mimeTypes?: readonly string[] }): InboundKind {
  if (DMARC_REPORT_SUBJECT_RE.test(input.subject)) return "noise";
  if (detectBounce({ from: input.fromRaw, subject: input.subject, body: input.body, mimeTypes: input.mimeTypes })) {
    return "bounce";
  }
  if (isAutoReply({ subject: input.subject, autoSubmitted: input.autoSubmitted ?? null })) {
    return "noise";
  }
  const lower = input.fromEmail.toLowerCase();
  const rawLower = input.fromRaw.toLowerCase();
  if (NOISE_SENDERS.some(n => lower.includes(n) || rawLower.includes(n))) return "noise";
  if (input.knownEmails.has(lower)) return "outreach_reply";
  if (input.hasListUnsubscribe) return "noise";
  if (input.inReplyTo && input.inReplyTo.trim() !== "") return "outreach_reply";
  return "human";
}

// ── W1: bounce breaker ───────────────────────────────────────────────────────

// DEC-0703A: send volume is scaling 20→40→80/day — the breaker exists so scale
// never outruns deliverability. Rate strictly ABOVE 3% with at least 10 sends
// that day (JST); below the minimum the sample is too small to act on.
export const BREAKER_THRESHOLD = 0.03;
export const BREAKER_MIN_SENT = 10;

export interface BreakerResult {
  /** bounces / sent, 0 when sent === 0 */
  rate: number;
  /** true ⇢ stop sending (rate > 3% AND sent >= 10) */
  active: boolean;
}

/** Daily bounce-rate breaker: today's bounce_events / today's email_sent (JST). */
export function computeBounceBreaker(bounces: number, sent: number): BreakerResult {
  const rate = sent > 0 ? bounces / sent : 0;
  return { rate, active: sent >= BREAKER_MIN_SENT && rate > BREAKER_THRESHOLD };
}

// ── §5.5 founding reply draft (Claude prompt) ────────────────────────────────

// Source: obsidian-vault SplanAI/40_Outreach/message_library.md §5.5
// "Founding 返信テンプレ"（2026-06-30 確定・founding-builders-program-20260630）.
// The server cannot read the Vault, so the template is embedded verbatim as the
// single source for terms: white-glove setup / free 60 days no card / founding
// rate while active Pro $29 (vs $49) · Team $99 (vs $149), monthly cancel
// anytime, annual = 2 months free / feedback chats + optional testimonial or
// intro, no obligation / CTA "send me one lot". Update HERE when §5.5 changes.
export const FOUNDING_REPLY_TEMPLATE = `Hi [First],
Great — glad it's a fit. Here's how the founding builder spot works, kept simple:
- I set you up personally and build your first few real proposals with you (white-glove).
- Free for 60 days, no card to start — use it on real lots with zero risk.
- After that, founding builders lock in a special rate while active: Pro $29/mo (vs $49) or Team $99/mo (vs $149). Monthly, cancel anytime; annual if you prefer (2 months free).
- In return: a couple of quick feedback chats, and — only if you genuinely like it — a short testimonial or an intro to another builder. No obligation.
Want me to set you up and build the first proposal? Send me one lot you're working and I'll take it from there.
— Shoji`;

// message_library.md 禁止語 ∪ daily-brief prompt extras. BANNED_WORDS already
// carries AI-powered / revolutionary / game-changing / cutting-edge /
// excited to announce; the rest are appended here.
export const REPLY_BANNED_WORDS: readonly string[] = [
  ...BANNED_WORDS,
  "seamless",
  "effortless",
  "unlock",
  "empower",
  "disrupting",
  "sell more",
];

export interface DraftPromptInput {
  kind: Extract<InboundKind, "outreach_reply" | "human">;
  fromName: string | null;
  fromEmail: string;
  company: string | null;
  subject: string;
  body: string; // inbound mail body (caller caps length)
  todayJST: string; // YYYY-MM-DD
}

/**
 * Prompt for the instant §5.5 reply draft (same model convention as
 * daily-brief: claude-haiku-4-5). HUMANIZE: first-person "I", short, warm,
 * solo-founder voice, zero fabrication, terms EXACTLY as §5.5.
 */
export function buildReplyDraftPrompt(input: DraftPromptInput): string {
  const senderLine = `${input.fromName || "(unknown name)"} <${input.fromEmail}>${input.company ? ` — company: ${input.company}` : ""}`;
  return `You are drafting an email reply for Shoji Shiraishi, the solo founder (based in Japan) of SplanAI (splanai.com) — an AI floor-plan/proposal tool for small US home builders: drop in a lot, get 3 buyer-ready concepts (layout, price, financing) in about 30 seconds. Not CAD, not a contract.

Today is ${input.todayJST}. A new email arrived at hello@splanai.com${input.kind === "outreach_reply" ? " — it is a REPLY to Shoji's founding-builders outreach" : " — it is NOT a known outreach reply (fresh inbound)"}.

From: ${senderLine}
Subject: ${input.subject || "(no subject)"}
Body:
"""
${input.body || "(empty body)"}
"""

## Founding builder terms (the ONLY terms you may state — copy them precisely, never invent or improve them):
${FOUNDING_REPLY_TEMPLATE}

## How to reply
- If the sender shows interest (positive / curious / "tell me more"): adapt the founding template above to their exact words. Keep every condition EXACT (free 60 days no card; then Pro $29/mo vs $49 or Team $99/mo vs $149 while active; monthly cancel anytime; annual = 2 months free; feedback chats + optional testimonial/intro; no obligation). End with the one CTA: send me one lot you're working.
- If they asked questions: answer briefly and honestly first (never invent features, customers, metrics, or timelines — if unsure, say I'll check), then the founding terms only if interest is clear.
- If they decline or say unsubscribe: 2-3 warm sentences, thank them, confirm I won't follow up. NO terms, NO pitch.
- If this is not an outreach reply (fresh inbound): a short helpful reply in Shoji's voice; mention founding terms ONLY if they ask about pricing/trials.

## Voice (STRICT)
- First person "I" (solo founder). SplanAI in third person — never "we".
- Short: 60-130 words. Plain builder-to-builder English. No marketing hype, no exclamation marks, no emoji.
- Mirror one concrete detail from their email so it reads personally written.
- NEVER use: ${REPLY_BANNED_WORDS.map(w => `"${w}"`).join(", ")}.
- Sign off exactly: "— Shoji" on its own line.

## Output (JSON only, no markdown fences)
{"summary_ja": "相手の意図の1行要約（日本語・Shoji向け）", "draft_en": "the full reply email body"}`;
}

// ── LINE message texts ───────────────────────────────────────────────────────

const LINE_TEXT_CAP = 4900; // LINE text message hard limit is 5000 chars
export const DRAFT_PUSH_CAP = 1000; // spec: draft body up to 1000 chars in push #2

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Push #1 — instant detection alert (sender, company, first 80 body chars). */
export function buildFirstAlertText(input: {
  kind: Extract<InboundKind, "outreach_reply" | "human">;
  fromName: string | null;
  fromEmail: string;
  company: string | null;
  subject: string;
  body: string;
}): string {
  const head = input.kind === "outreach_reply" ? "📩 アウトリーチ返信を検知" : "📨 新規メール（人間）を検知";
  const who = `${input.fromName || input.fromEmail}${input.company ? `（${input.company}）` : ""}`;
  const excerpt = truncate(input.body.replace(/\s+/g, " ").trim(), 80);
  return truncate(
    `${head}\n${who}\n件名: ${input.subject || "(no subject)"}\n${excerpt}\n→ §5.5返信ドラフト生成中…`,
    LINE_TEXT_CAP,
  );
}

/** Push #2 — the copy-paste-ready draft (≤1000 chars) + Gmail deep link. */
export function buildDraftAlertText(input: {
  fromName: string | null;
  company: string | null;
  draft: string;
  gmailThreadId: string | null;
}): string {
  const who = input.company || input.fromName || "";
  const link = input.gmailThreadId
    ? `\n\nGmail: https://mail.google.com/mail/#inbox/${input.gmailThreadId}`
    : "";
  return truncate(
    `✍️ 返信ドラフト（§5.5）${who ? `— ${who}` : ""}\n\n${truncate(input.draft, DRAFT_PUSH_CAP)}${link}`,
    LINE_TEXT_CAP,
  );
}

/** Breaker alert — fired once per JST day on the inactive→active transition. */
export function buildBreakerAlertText(input: {
  rate: number;
  bounces: number;
  sent: number;
  date: string;
}): string {
  const pct = (input.rate * 100).toFixed(1);
  return truncate(
    `⛔ 送信ブレーカー発動（${input.date}）\nバウンス率 ${pct}%（bounce ${input.bounces} / sent ${input.sent}・閾値3%超）\n本日の新規送信を停止してください。バウンス先は suppression 登録済み。\nリストの検証（verified個人アドレスのみ）を見直してから再開を。`,
    LINE_TEXT_CAP,
  );
}

// ── Gmail payload helpers ────────────────────────────────────────────────────
// Same decoding approach as daily-brief (src/app/api/cron/daily-brief/route.ts)
// but RECURSIVE: DSNs are multipart/report whose text/plain and
// message/delivery-status parts sit one level deeper than a plain reply, so a
// single-level scan would miss the Final-Recipient block.

export interface GmailPart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }>;
}

export function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** All mime types in a payload tree (depth-first) — feeds the DSN MIME signal. */
export function flattenMimeTypes(payload: GmailPart | null | undefined): string[] {
  if (!payload) return [];
  const out: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType) out.push(p.mimeType);
    for (const child of p.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

/**
 * Flatten every decodable text-ish part (text/*, message/delivery-status) of a
 * Gmail payload into one string, depth-first. Used for both the reply excerpt
 * and DSN target extraction.
 */
export function extractBodyText(payload: GmailPart | null | undefined): string {
  if (!payload) return "";
  const chunks: string[] = [];
  const walk = (p: GmailPart) => {
    const mime = (p.mimeType ?? "").toLowerCase();
    const isTexty =
      mime.startsWith("text/") || mime.startsWith("message/delivery-status") || mime === "";
    if (isTexty && mime !== "text/html" && p.body?.data) chunks.push(decodeBase64Url(p.body.data));
    for (const child of p.parts ?? []) walk(child);
  };
  walk(payload);
  if (chunks.length > 0) return chunks.join("\n");
  // Fallback: html or any part carrying data (tags stripped crudely)
  const any: string[] = [];
  const walkAny = (p: GmailPart) => {
    if (p.body?.data) any.push(decodeBase64Url(p.body.data));
    for (const child of p.parts ?? []) walkAny(child);
  };
  walkAny(payload);
  return any.join("\n").replace(/<[^>]+>/g, " ");
}

// ── misc helpers shared with the route ───────────────────────────────────────

/** `"Dean Womack" <dean@acme.com>` → bare address; falls back to the raw string. */
export function parseFromHeader(raw: string): { email: string; name: string | null } {
  const email = raw.match(/<([^>]+)>/)?.[1]?.trim() ?? raw.trim();
  const name = raw.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || null;
  return { email, name };
}

/** JST calendar date (YYYY-MM-DD) and its UTC start instant, for "today" windows. */
export function jstToday(now: Date = new Date()): { date: string; startUtcIso: string } {
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  // JST is fixed UTC+9 (no DST): JST midnight = date 00:00+09:00
  const startUtcIso = new Date(`${date}T00:00:00+09:00`).toISOString();
  return { date, startUtcIso };
}
