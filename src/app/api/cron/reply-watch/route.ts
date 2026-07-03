import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import { pushMessages } from "@/lib/line";
import { recordHeartbeat } from "@/lib/heartbeat";
import {
  buildBreakerAlertText,
  buildDraftAlertText,
  buildFirstAlertText,
  buildReplyDraftPrompt,
  classifyInbound,
  computeBounceBreaker,
  detectBounce,
  extractBodyText,
  flattenMimeTypes,
  getHeader,
  jstToday,
  parseFromHeader,
  type GmailPart,
  type InboundKind,
} from "@/lib/reply-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case: ~25 messages × (Gmail get + LINE push + Haiku draft + LINE push).
// Typical run (no new mail) finishes in ~2s. Requires Vercel Pro (300s cron cap).
export const maxDuration = 300;

// W2/W1 (DEC-0703A, 2026-07-03) — reply-watch: every 15 min, scan the
// hello@splanai.com inbox (same Gmail OAuth route as daily-brief:
// GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN) for mail newer
// than the alert_state watermark and
//   (a) outreach replies / human mail → LINE push #1 (who/company/80 chars)
//       → Claude Haiku §5.5 founding reply draft → reply_drafts row
//       → LINE push #2 with the copy-paste-ready draft (≤1000 chars).
//   (b) DSN bounces → bounce_events row + growth_suppression_list
//       (reason='bounce_hard') + daily bounce-rate breaker:
//       today(JST) bounce_events / growth_outreach_events(type=email_sent),
//       > 3% with sent ≥ 10 ⇒ alert_state key='send-breaker'
//       meta={active,date,rate,bounces,sent,alerted_date} + one LINE warning
//       per JST day. The local Outreach Pack reads that key to show ⛔.
//
// FAIL-LOUD (hot-lead-alert discipline): a hard failure (Gmail/DB/LINE#1) does
// NOT advance the watermark — the window re-scans next run and rows already
// written are skipped via the reply_drafts / bounce_events gmail_message_id
// UNIQUE pre-check, so nothing is lost and nothing double-pushes. A draft
// (Claude) failure is DEGRADED instead: the row is saved with draft_body=null
// and a fallback push points at message_library §5.5, the watermark advances
// (no 15-min alert spam), and the run still records a heartbeat error + 500.
//
// Hardening (codex review, bridge msg=133):
//   - every Gmail query re-scans a 5-min overlap behind the watermark (second
//     granularity + search-index lag); dedup makes the overlap free
//   - paginated list + oldest-first 25/run backlog drain; ≥500 = flood → abort
//   - a narrow in:spam sweep catches spam-filtered DSNs (bounce-only — spam
//     can never reach LINE or the draft pipeline)
//   - DSN detection also keys on multipart/report MIME, and DELAY/soft
//     notifications are excluded (they are not failures yet)
//   - OOO/autoresponders (Auto-Submitted header / subject) are noise, never
//     §5.5-drafted, even though they carry In-Reply-To
const JOB = "reply-watch";
const INBOX_EMAIL = "hello@splanai.com";
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000; // no state row yet → scan last hour only
const SAFETY_LAG_MS = 30 * 1000; // same rationale as hot-lead-alert (late-visible rows)
// (codex review) Gmail `after:` is second-granular AND the search index can lag
// behind delivery — every query therefore re-scans a fixed overlap behind the
// watermark; the gmail_message_id dedup pre-check makes the overlap free.
const QUERY_OVERLAP_MS = 5 * 60 * 1000;
const MESSAGE_CAP = 25; // per-run PROCESSING cap; watermark stops at the last processed msg
const LIST_HARD_CAP = 500; // pagination cap; hitting it = pathological flood → fail loud
const BODY_SAVE_CAP = 8000; // reply_drafts.original_body cap
const BODY_PROMPT_CAP = 4000; // inbound body chars fed to the draft prompt
const DRAFT_MODEL = "claude-haiku-4-5-20251001"; // same model convention as daily-brief triage

type Msg = {
  id: string;
  threadId: string | null;
  internalDate: number;
  fromRaw: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  body: string;
  mimeTypes: string[];
  hasListUnsubscribe: boolean;
  autoSubmitted: string | null;
  inReplyTo: string | null;
  /** true = found by the spam-folder DSN sweep — bounce handling ONLY */
  spamOnly: boolean;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

// Known outreach addresses (lowercased) + company resolution sources.
async function loadKnownAddresses(supabase: SupabaseClient): Promise<{
  known: Set<string>;
  companyByEmail: Map<string, string>;
}> {
  const known = new Set<string>();
  const companyByEmail = new Map<string, string>();

  const { data: contacts, error: gcError } = await supabase
    .from("growth_contacts")
    .select("email, company_id")
    .not("email", "is", null)
    .limit(5000);
  if (gcError) throw new Error(`growth_contacts read failed: ${gcError.message}`);
  const contactRows = (contacts ?? []) as Array<{ email: string; company_id: string | null }>;

  const companyIds = [...new Set(contactRows.map(c => c.company_id).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: comps, error: compError } = await supabase
      .from("growth_companies")
      .select("id, name")
      .in("id", companyIds);
    if (compError) throw new Error(`growth_companies read failed: ${compError.message}`);
    for (const c of (comps ?? []) as Array<{ id: string; name: string }>) nameById.set(c.id, c.name);
  }
  for (const c of contactRows) {
    const email = c.email.trim().toLowerCase();
    if (!email) continue;
    known.add(email);
    const name = c.company_id ? nameById.get(c.company_id) : undefined;
    if (name && !companyByEmail.has(email)) companyByEmail.set(email, name);
  }

  const { data: logs, error: olError } = await supabase
    .from("outreach_log")
    .select("contact_email, company_name")
    .not("contact_email", "is", null)
    .limit(5000);
  if (olError) throw new Error(`outreach_log read failed: ${olError.message}`);
  for (const l of (logs ?? []) as Array<{ contact_email: string; company_name: string | null }>) {
    const email = l.contact_email.trim().toLowerCase();
    if (!email) continue;
    known.add(email);
    if (l.company_name && !companyByEmail.has(email)) companyByEmail.set(email, l.company_name);
  }

  return { known, companyByEmail };
}

type GmailClient = ReturnType<typeof getGmailClient>;

// messages.list with pagination up to LIST_HARD_CAP ids (codex review: a single
// 50-id page silently drops the OLDEST messages of a backlog — they would then
// fall behind the advancing watermark and be lost).
async function listMessageIds(gmail: GmailClient, q: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 100, pageToken });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < LIST_HARD_CAP);
  if (ids.length >= LIST_HARD_CAP) {
    throw new Error(
      `gmail list hit the ${LIST_HARD_CAP}-message cap for q="${q}" — mail flood; watermark held, human review needed`,
    );
  }
  return ids;
}

// Fetch messages newer than the (overlap-shifted) watermark, ascending.
// Two sweeps (codex review): the inbox for everything, and a NARROW spam-folder
// sweep for DSNs only — a spam-filtered bounce must still count toward the
// breaker, but spam must never earn a LINE push or a §5.5 draft (spamOnly).
async function fetchNewMessages(lastCheckedMs: number, windowEndMs: number): Promise<Msg[]> {
  const gmail = getGmailClient();
  const afterSec = Math.floor((lastCheckedMs - QUERY_OVERLAP_MS) / 1000);
  const sweeps: Array<{ q: string; spamOnly: boolean }> = [
    { q: `in:inbox after:${afterSec}`, spamOnly: false },
    {
      q: `in:spam after:${afterSec} (from:mailer-daemon OR from:postmaster OR subject:undeliverable OR subject:"delivery status notification")`,
      spamOnly: true,
    },
  ];

  const out: Msg[] = [];
  const seen = new Set<string>();
  for (const sweep of sweeps) {
    const ids = await listMessageIds(gmail, sweep.q);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const msgRes = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const payload = msgRes.data.payload as GmailPart | undefined;
      const headers = (payload?.headers ?? []) as Array<{ name?: string | null; value?: string | null }>;
      const internalDate = Number(msgRes.data.internalDate ?? 0);
      // Upper bound only: the lower bound is the query's overlap window — rows
      // inside the overlap that were already handled are dropped by the
      // gmail_message_id dedup pre-check, never re-alerted.
      if (internalDate > windowEndMs) continue;

      const fromRaw = getHeader(headers, "from");
      const { email, name } = parseFromHeader(fromRaw);
      out.push({
        id,
        threadId: msgRes.data.threadId ?? null,
        internalDate,
        fromRaw,
        fromEmail: email.toLowerCase(),
        fromName: name,
        subject: getHeader(headers, "subject") || "(no subject)",
        body: extractBodyText(payload),
        mimeTypes: flattenMimeTypes(payload),
        hasListUnsubscribe: !!getHeader(headers, "list-unsubscribe"),
        autoSubmitted: getHeader(headers, "auto-submitted") || null,
        inReplyTo: getHeader(headers, "in-reply-to") || null,
        spamOnly: sweep.spamOnly,
      });
    }
  }
  out.sort((a, b) => a.internalDate - b.internalDate);
  return out;
}

// insert that treats 23505 (unique_violation) as "already recorded" (idempotent).
async function insertIgnoreDuplicate(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<"inserted" | "duplicate"> {
  const { error } = await supabase.from(table).insert(row);
  if (!error) return "inserted";
  if (error.code === "23505") return "duplicate";
  throw new Error(`${table} insert failed: ${error.message}`);
}

async function generateDraft(
  anthropic: Anthropic,
  input: Parameters<typeof buildReplyDraftPrompt>[0],
): Promise<{ draft: string | null; summaryJa: string | null; error: string | null }> {
  try {
    const msg = await anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: buildReplyDraftPrompt(input) }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { draft: null, summaryJa: null, error: "no JSON in Claude response" };
    const parsed = JSON.parse(jsonMatch[0]) as { summary_ja?: string; draft_en?: string };
    if (!parsed.draft_en?.trim()) return { draft: null, summaryJa: parsed.summary_ja ?? null, error: "empty draft_en" };
    return { draft: parsed.draft_en.trim(), summaryJa: parsed.summary_ja ?? null, error: null };
  } catch (err) {
    return { draft: null, summaryJa: null, error: toErrorMessage(err) };
  }
}

async function runReplyWatch(supabase: SupabaseClient) {
  const runStart = new Date();
  const runStartIso = runStart.toISOString();
  const windowEndMs = runStart.getTime() - SAFETY_LAG_MS;

  // 1. Watermark
  const { data: state, error: stateError } = await supabase
    .from("alert_state")
    .select("last_checked")
    .eq("key", JOB)
    .maybeSingle();
  if (stateError) throw new Error(`alert_state read failed: ${stateError.message}`);
  const lastCheckedMs = state?.last_checked
    ? new Date(state.last_checked as string).getTime()
    : runStart.getTime() - FIRST_RUN_LOOKBACK_MS;

  // 2. New inbox messages (fail-loud: Gmail errors abort the run, watermark stays)
  const all = await fetchNewMessages(lastCheckedMs, windowEndMs);

  // 3. Dedup pre-check FIRST (rows already written by a previous run — incl. the
  // query-overlap window), then cap the remaining WORK. Capping before dedup
  // would waste the per-run budget on messages that are already terminal.
  const alreadyDone = new Set<string>();
  const allIds = all.map(m => m.id);
  for (let i = 0; i < allIds.length; i += 100) {
    const chunk = allIds.slice(i, i + 100);
    const [drafted, bounced] = await Promise.all([
      supabase.from("reply_drafts").select("gmail_message_id").in("gmail_message_id", chunk),
      supabase.from("bounce_events").select("gmail_message_id").in("gmail_message_id", chunk),
    ]);
    if (drafted.error) throw new Error(`reply_drafts dedup read failed: ${drafted.error.message}`);
    if (bounced.error) throw new Error(`bounce_events dedup read failed: ${bounced.error.message}`);
    for (const r of (drafted.data ?? []) as Array<{ gmail_message_id: string | null }>) {
      if (r.gmail_message_id) alreadyDone.add(r.gmail_message_id);
    }
    for (const r of (bounced.data ?? []) as Array<{ gmail_message_id: string | null }>) {
      if (r.gmail_message_id) alreadyDone.add(r.gmail_message_id);
    }
  }
  const pending = all.filter(m => !alreadyDone.has(m.id));
  const skippedDone = all.length - pending.length;
  // Backlog drain (codex review): when >25 messages are pending, process the
  // OLDEST 25 and park the watermark at the last processed message — the rest
  // stay above it and drain on the following runs, 25 per 15 min.
  const capped = pending.length > MESSAGE_CAP;
  const messages = capped ? pending.slice(0, MESSAGE_CAP) : pending;
  const nextWatermarkMs = capped ? messages[messages.length - 1].internalDate : windowEndMs;

  // 4. Known outreach addresses (only when there is something to classify)
  const { known, companyByEmail } = messages.length > 0
    ? await loadKnownAddresses(supabase)
    : { known: new Set<string>(), companyByEmail: new Map<string, string>() };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
  const { date: todayJst, startUtcIso: jstDayStartIso } = jstToday(runStart);

  const counts: Record<InboundKind, number> = { bounce: 0, noise: 0, outreach_reply: 0, human: 0 };
  let draftsCreated = 0;
  let suppressed = 0;
  const hardFailures: string[] = [];
  const degraded: string[] = [];

  // 5. Per-message handling, oldest first (messages are pre-filtered: not yet in DB)
  for (const m of messages) {
    try {
      // Self-sends from the inbox address itself never alert
      let kind: InboundKind =
        m.fromEmail === INBOX_EMAIL
          ? "noise"
          : classifyInbound({
              fromEmail: m.fromEmail,
              fromRaw: m.fromRaw,
              subject: m.subject,
              body: m.body,
              mimeTypes: m.mimeTypes,
              hasListUnsubscribe: m.hasListUnsubscribe,
              autoSubmitted: m.autoSubmitted,
              inReplyTo: m.inReplyTo,
              knownEmails: known,
            });
      // Spam-sweep messages are bounce candidates ONLY — actual spam must never
      // reach LINE or the draft pipeline.
      if (m.spamOnly && kind !== "bounce") kind = "noise";
      counts[kind]++;

      if (kind === "noise") continue;

      if (kind === "bounce") {
        const det = detectBounce({ from: m.fromRaw, subject: m.subject, body: m.body, mimeTypes: m.mimeTypes });
        const inserted = await insertIgnoreDuplicate(supabase, "bounce_events", {
          gmail_message_id: m.id,
          occurred_at: new Date(m.internalDate).toISOString(),
          target_email: det?.targetEmail ?? null,
          reason: det?.reason ?? "dsn",
          raw_subject: m.subject.slice(0, 500),
        });
        if (inserted === "inserted" && det?.targetEmail) {
          const res = await insertIgnoreDuplicate(supabase, "growth_suppression_list", {
            email: det.targetEmail,
            reason: "bounce_hard",
          });
          if (res === "inserted") suppressed++;
        }
        continue;
      }

      // outreach_reply | human
      const company = companyByEmail.get(m.fromEmail) ?? null;

      // Push #1 — instant detection alert. A failure here is HARD: the row is
      // not written yet, the watermark will not advance, and the message
      // re-alerts next run (hot-lead-alert semantics: never silently lost).
      const first = await pushMessages([
        {
          type: "text",
          text: buildFirstAlertText({
            kind,
            fromName: m.fromName,
            fromEmail: m.fromEmail,
            company,
            subject: m.subject,
            body: m.body,
          }),
        },
      ]);
      if (!first.ok) {
        throw new Error(`LINE push #1 failed (${first.status}): ${first.body.slice(0, 200)}`);
      }

      // §5.5 draft (degraded on failure — row still written, no alert spam)
      const gen = anthropic
        ? await generateDraft(anthropic, {
            kind,
            fromName: m.fromName,
            fromEmail: m.fromEmail,
            company,
            subject: m.subject,
            body: m.body.slice(0, BODY_PROMPT_CAP),
            todayJST: todayJst,
          })
        : { draft: null, summaryJa: null, error: "ANTHROPIC_API_KEY not set" };
      if (gen.error) degraded.push(`draft(${m.fromEmail}): ${gen.error}`);

      const inserted = await insertIgnoreDuplicate(supabase, "reply_drafts", {
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        kind,
        received_at: new Date(m.internalDate).toISOString(),
        from_email: m.fromEmail,
        from_name: m.fromName,
        company,
        subject: m.subject.slice(0, 500),
        original_body: m.body.slice(0, BODY_SAVE_CAP),
        draft_body: gen.draft,
        status: "pending",
      });
      if (inserted === "duplicate") continue; // pre-check raced — already handled

      // Push #2 — the copy-paste-ready draft (or a §5.5 pointer on failure).
      // Failure here is degraded, not hard: the row exists (renderable in the
      // Vault), so re-pushing on rescan would double-alert.
      const second = await pushMessages([
        {
          type: "text",
          text: gen.draft
            ? buildDraftAlertText({
                fromName: m.fromName,
                company,
                draft: gen.draft,
                gmailThreadId: m.threadId,
              })
            : `⚠ ドラフト生成失敗（${company ?? m.fromName ?? m.fromEmail}）\n手動対応: Vault message_library.md §5.5 の founding返信テンプレを使ってください。\n理由: ${(gen.error ?? "unknown").slice(0, 200)}`,
        },
      ]);
      if (!second.ok) {
        degraded.push(`LINE push #2 (${m.fromEmail}): ${second.status} ${second.body.slice(0, 120)}`);
      }
      if (gen.draft) draftsCreated++;
    } catch (err) {
      hardFailures.push(`${m.fromEmail || m.id}: ${toErrorMessage(err)}`);
    }
  }

  // 6. W1 breaker — evaluated every run so bounces from any source (this run or
  // earlier) trip it within 15 min. JST "today" window, per DEC-0703A ops day.
  let breaker = { date: todayJst, sent: 0, bounces: 0, rate: 0, active: false };
  try {
    const [bounceRes, sentRes] = await Promise.all([
      supabase
        .from("bounce_events")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", jstDayStartIso),
      supabase
        .from("growth_outreach_events")
        .select("id", { count: "exact", head: true })
        .eq("type", "email_sent")
        .gte("occurred_at", jstDayStartIso),
    ]);
    if (bounceRes.error) throw new Error(`bounce_events count failed: ${bounceRes.error.message}`);
    if (sentRes.error) throw new Error(`growth_outreach_events count failed: ${sentRes.error.message}`);
    const bounces = bounceRes.count ?? 0;
    const sent = sentRes.count ?? 0;
    const { rate, active } = computeBounceBreaker(bounces, sent);

    const { data: bState, error: bStateError } = await supabase
      .from("alert_state")
      .select("meta")
      .eq("key", "send-breaker")
      .maybeSingle();
    if (bStateError) throw new Error(`alert_state(send-breaker) read failed: ${bStateError.message}`);
    const prevMeta = (bState?.meta ?? {}) as {
      active?: boolean;
      date?: string;
      alerted_date?: string | null;
    };
    // Latch: once active for a JST date it stays active that whole date (more
    // sends diluting the rate must not silently re-open the pipe); a new date
    // starts fresh.
    const latched = active || (prevMeta.active === true && prevMeta.date === todayJst);
    let alertedDate = prevMeta.date === todayJst ? (prevMeta.alerted_date ?? null) : null;

    if (latched && alertedDate !== todayJst) {
      const warn = await pushMessages([
        { type: "text", text: buildBreakerAlertText({ rate, bounces, sent, date: todayJst }) },
      ]);
      if (warn.ok) {
        alertedDate = todayJst; // delivered — once per JST day
      } else {
        // alerted_date stays null → the next run retries the warning
        degraded.push(`breaker LINE warn failed: ${warn.status} ${warn.body.slice(0, 120)}`);
      }
    }

    breaker = { date: todayJst, sent, bounces, rate: Number(rate.toFixed(4)), active: latched };
    const { error: bWriteError } = await supabase.from("alert_state").upsert(
      {
        key: "send-breaker",
        last_checked: runStartIso,
        meta: {
          active: latched,
          date: todayJst,
          rate: Number(rate.toFixed(4)),
          bounces,
          sent,
          alerted_date: alertedDate,
        },
        updated_at: runStartIso,
      },
      { onConflict: "key" },
    );
    if (bWriteError) throw new Error(`alert_state(send-breaker) write failed: ${bWriteError.message}`);
  } catch (err) {
    hardFailures.push(`breaker: ${toErrorMessage(err)}`);
  }

  // 7. Advance the reply-watch watermark ONLY when every message reached a
  // terminal state (row written / noise). Hard failures leave it in place so
  // the window re-scans; the dedup pre-check keeps that idempotent.
  if (hardFailures.length === 0) {
    const { error } = await supabase.from("alert_state").upsert(
      {
        key: JOB,
        last_checked: new Date(nextWatermarkMs).toISOString(),
        meta: {},
        updated_at: runStartIso,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`alert_state write failed: ${error.message}`);
  }

  return {
    fetched: all.length,
    processed: messages.length,
    backlog_capped: capped,
    skipped_already_done: skippedDone,
    counts,
    drafts_created: draftsCreated,
    suppression_added: suppressed,
    breaker,
    watermark_advanced: hardFailures.length === 0,
    hard_failures: hardFailures,
    degraded,
  };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordHeartbeat(JOB, { ok: false, error: "missing Supabase env" });
    return NextResponse.json(
      { ok: false, error: "missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    // Unlike daily-brief (which degrades to a brief without inbox), the ENTIRE
    // point of reply-watch is the inbox — fail loud so the gap is visible.
    await recordHeartbeat(JOB, {
      ok: false,
      error: "Gmail OAuth not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN)",
    });
    return NextResponse.json({ ok: false, error: "Gmail OAuth not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  try {
    const result = await runReplyWatch(supabase);
    const problems = [...result.hard_failures, ...result.degraded];
    if (problems.length > 0) {
      const message = problems.join(" | ").slice(0, 900);
      console.error(`[${JOB}] FAILED:`, message);
      await recordHeartbeat(JOB, { ok: false, error: message });
      return NextResponse.json({ ok: false, ...result, error: message }, { status: 500 });
    }
    await recordHeartbeat(JOB, { ok: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = toErrorMessage(err);
    console.error(`[${JOB}] FAILED:`, message);
    // First-failure LINE notice only (hot-lead-alert discipline): a persistent
    // breakage must not push every 15 minutes.
    let alreadyFailing = false;
    try {
      const { data: hb } = await supabase
        .from("cron_heartbeats")
        .select("last_error")
        .eq("job", JOB)
        .maybeSingle();
      alreadyFailing = !!hb?.last_error;
    } catch {
      // heartbeat table unreadable — treat as first failure (stay loud)
    }
    await recordHeartbeat(JOB, { ok: false, error: message });
    if (!alreadyFailing) {
      await pushMessages([{ type: "text", text: `⚠ reply-watch 失敗\n${message.slice(0, 300)}` }]);
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
