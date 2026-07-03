/**
 * Unit tests for the reply-watch pure logic (W2 instant reply + W1 bounce
 * breaker): DSN detection from real mailer-daemon shapes, bounced-recipient
 * extraction from a multipart/report Gmail payload, inbound classification
 * order, the 3%/10-send breaker boundaries, and LINE text caps.
 * Run with: npx tsx src/lib/reply-watch.test.ts
 * (Same convention as content-quality.test.ts — no real email is ever sent.)
 */
import assert from "node:assert/strict";
import {
  BREAKER_MIN_SENT,
  BREAKER_THRESHOLD,
  DRAFT_PUSH_CAP,
  FOUNDING_REPLY_TEMPLATE,
  REPLY_BANNED_WORDS,
  buildBreakerAlertText,
  buildDraftAlertText,
  buildFirstAlertText,
  buildReplyDraftPrompt,
  classifyInbound,
  computeBounceBreaker,
  detectBounce,
  extractBodyText,
  extractBounceTarget,
  jstToday,
  parseFromHeader,
  type GmailPart,
} from "./reply-watch";

let passed = 0;
function ok(cond: boolean, msg: string) {
  assert.ok(cond, msg);
  passed++;
}

const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

// ── 1. DSN detection: real-world mailer-daemon sender/subject shapes ─────────
{
  // Gmail's own DSN
  const gmailDsn = detectBounce({
    from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    subject: "Delivery Status Notification (Failure)",
  });
  ok(gmailDsn !== null && gmailDsn.reason === "dsn_sender", "Gmail mailer-daemon DSN detected via sender");

  // Exchange/Outlook
  ok(
    detectBounce({
      from: "postmaster@outlook.com",
      subject: "Undeliverable: a 30-second proposal for an Acme lot?",
    }) !== null,
    "Exchange postmaster + Undeliverable detected",
  );

  // Subject-only (odd MTA sender name)
  const subjOnly = detectBounce({
    from: "MAILER@relay.example.net",
    subject: "Mail delivery failed: returning message to sender",
  });
  ok(subjOnly !== null && subjOnly.reason === "dsn_subject", "exim 'Mail delivery failed' detected via subject");

  ok(
    detectBounce({ from: "postmaster@corp.example.com", subject: "Message not delivered" }) !== null,
    "'Message not delivered' detected",
  );

  // NOT bounces
  ok(
    detectBounce({ from: "Dean Womack <dean@acmehomes.com>", subject: "Re: a 30-second proposal" }) === null,
    "a normal reply is not a bounce",
  );
  ok(
    detectBounce({ from: "Laura <laura@buildco.com>", subject: "Question about delivery timelines" }) === null,
    "'delivery timelines' in a human subject is not a DSN (needs 'delivery status notification' etc.)",
  );

  // SOFT/delay notifications are NOT failures (codex review): the MTA is still
  // retrying — counting them would trip the breaker and suppress live addresses.
  ok(
    detectBounce({
      from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      subject: "Delivery Status Notification (Delay)",
    }) === null,
    "Gmail DELAY notification is not a bounce",
  );
  ok(
    detectBounce({ from: "postmaster@relay.example.com", subject: "Delivery incomplete" }) === null,
    "'Delivery incomplete' (still retrying) is not a bounce",
  );

  // DSN MIME structure alone is a signal (codex review), e.g. an MTA with a
  // localized sender/subject.
  const mimeOnly = detectBounce({
    from: "MTA Daemon <daemon@mail.example.co.jp>",
    subject: "メッセージを配信できませんでした",
    mimeTypes: ["multipart/report", "text/plain", "message/delivery-status", "message/rfc822"],
  });
  ok(mimeOnly !== null && mimeOnly.reason === "dsn_mime", "multipart/report + delivery-status MIME detected");
}

// ── 2. Bounced-recipient extraction (structured DSN fields + prose) ──────────
{
  ok(
    extractBounceTarget(
      "Reporting-MTA: dns; googlemail.com\nFinal-Recipient: rfc822; dean@acmehomes.com\nAction: failed\nStatus: 5.1.1",
    ) === "dean@acmehomes.com",
    "Final-Recipient extracted",
  );
  ok(
    extractBounceTarget("X-Failed-Recipients: Laura.Smith@BuildCo.com\n\nsome text") ===
      "laura.smith@buildco.com",
    "X-Failed-Recipients extracted and lowercased",
  );
  ok(
    extractBounceTarget(
      "Your message wasn't delivered to bill@cottagehomes.com because the address couldn't be found.",
    ) === "bill@cottagehomes.com",
    "Gmail prose target extracted",
  );
  ok(
    extractBounceTarget("The following address(es) failed:\n  carl@tresidio.com\n") === "carl@tresidio.com",
    "exim 'following address(es) failed' extracted",
  );
  ok(extractBounceTarget("no recipient information at all") === null, "no target → null (still counts as bounce)");
}

// ── 3. multipart/report Gmail payload → body text → target (sample MIME) ─────
{
  const dsnPayload: GmailPart = {
    mimeType: "multipart/report",
    parts: [
      {
        mimeType: "text/plain",
        body: {
          data: b64url(
            "** Address not found **\nYour message wasn't delivered to dean@acmehomes.com because the address couldn't be found, or is unable to receive mail.",
          ),
        },
      },
      {
        mimeType: "message/delivery-status",
        body: {
          data: b64url(
            "Reporting-MTA: dns; googlemail.com\nFinal-Recipient: rfc822; dean@acmehomes.com\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550-5.1.1 The email account does not exist.",
          ),
        },
      },
      { mimeType: "message/rfc822", body: {} },
    ],
  };
  const body = extractBodyText(dsnPayload);
  ok(body.includes("Final-Recipient"), "recursive extractBodyText reaches message/delivery-status part");
  const det = detectBounce({
    from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    subject: "Delivery Status Notification (Failure)",
    body,
  });
  ok(det?.targetEmail === "dean@acmehomes.com", "full pipeline: sample DSN MIME → target email");

  // Nested multipart/alternative (normal reply) still yields text
  const nested: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("Sounds interesting — send me the details.") } },
          { mimeType: "text/html", body: { data: b64url("<p>Sounds interesting</p>") } },
        ],
      },
    ],
  };
  ok(
    extractBodyText(nested).includes("send me the details"),
    "nested multipart/alternative text/plain extracted",
  );
}

// ── 4. Classification order: bounce > noise > outreach_reply > human ─────────
{
  const known = new Set(["dean@acmehomes.com"]);
  const base = { subject: "Re: proposal", body: "", hasListUnsubscribe: false, inReplyTo: null, knownEmails: known };

  ok(
    classifyInbound({
      ...base,
      fromEmail: "mailer-daemon@googlemail.com",
      fromRaw: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      subject: "Delivery Status Notification (Failure)",
    }) === "bounce",
    "mailer-daemon classified as bounce (never swallowed as noise)",
  );
  ok(
    classifyInbound({ ...base, fromEmail: "noreply@stripe.com", fromRaw: "Stripe <noreply@stripe.com>" }) ===
      "noise",
    "noreply@ + stripe.com → noise",
  );
  ok(
    classifyInbound({
      ...base,
      fromEmail: "news@builderweekly.com",
      fromRaw: "Builder Weekly <news@builderweekly.com>",
      hasListUnsubscribe: true,
    }) === "noise",
    "List-Unsubscribe → noise",
  );
  ok(
    classifyInbound({ ...base, fromEmail: "dean@acmehomes.com", fromRaw: "Dean <dean@acmehomes.com>" }) ===
      "outreach_reply",
    "known growth_contacts/outreach_log address → outreach_reply",
  );
  ok(
    classifyInbound({
      ...base,
      fromEmail: "assistant@acmehomes.com",
      fromRaw: "Acme Assistant <assistant@acmehomes.com>",
      inReplyTo: "<CAF+xyz@mail.gmail.com>",
    }) === "outreach_reply",
    "unknown address but In-Reply-To present → outreach_reply",
  );
  ok(
    classifyInbound({ ...base, fromEmail: "stranger@somewhere.com", fromRaw: "S <stranger@somewhere.com>" }) ===
      "human",
    "unknown fresh mail → human",
  );

  // codex review: OOO autoresponders carry In-Reply-To and may come from a
  // KNOWN prospect — they must be noise (never a §5.5 draft or LINE pair).
  ok(
    classifyInbound({
      ...base,
      fromEmail: "dean@acmehomes.com",
      fromRaw: "Dean <dean@acmehomes.com>",
      subject: "Automatic reply: a 30-second proposal for an Acme lot?",
      inReplyTo: "<CAF+abc@mail.gmail.com>",
    }) === "noise",
    "OOO subject from a known prospect → noise",
  );
  ok(
    classifyInbound({
      ...base,
      fromEmail: "dean@acmehomes.com",
      fromRaw: "Dean <dean@acmehomes.com>",
      autoSubmitted: "auto-replied",
      inReplyTo: "<CAF+abc@mail.gmail.com>",
    }) === "noise",
    "Auto-Submitted: auto-replied → noise even from a known prospect",
  );
  ok(
    classifyInbound({
      ...base,
      fromEmail: "dean@acmehomes.com",
      fromRaw: "Dean <dean@acmehomes.com>",
      autoSubmitted: "no",
    }) === "outreach_reply",
    "Auto-Submitted: no (explicit human) still classifies as outreach_reply",
  );

  // codex review: a KNOWN address outranks List-Unsubscribe — a prospect's
  // personal reply must never be dropped as marketing noise.
  ok(
    classifyInbound({
      ...base,
      fromEmail: "dean@acmehomes.com",
      fromRaw: "Dean <dean@acmehomes.com>",
      hasListUnsubscribe: true,
    }) === "outreach_reply",
    "known address + List-Unsubscribe → outreach_reply (known wins)",
  );
}

// ── 5. Breaker boundaries (>3% AND sent>=10) ─────────────────────────────────
{
  assert.equal(BREAKER_THRESHOLD, 0.03);
  assert.equal(BREAKER_MIN_SENT, 10);
  passed += 2;

  const exactly3pct = computeBounceBreaker(3, 100);
  ok(Math.abs(exactly3pct.rate - 0.03) < 1e-12 && exactly3pct.active === false, "rate exactly 3% does NOT trip (strictly greater)");

  const above = computeBounceBreaker(4, 100);
  ok(above.active === true, "4/100 = 4% trips");

  const smallSample = computeBounceBreaker(9, 9);
  ok(smallSample.active === false && smallSample.rate === 1, "sent<10 never trips even at 100% bounce");

  const minSent = computeBounceBreaker(1, 10);
  ok(minSent.active === true && Math.abs(minSent.rate - 0.1) < 1e-12, "1/10 = 10% trips at the sent>=10 minimum");

  const zeroSent = computeBounceBreaker(2, 0);
  ok(zeroSent.active === false && zeroSent.rate === 0, "sent=0 → rate 0, no trip (no divide-by-zero)");

  const clean = computeBounceBreaker(0, 40);
  ok(clean.active === false && clean.rate === 0, "0/40 stays quiet");
}

// ── 6. LINE texts: 80-char excerpt, 1000-char draft cap ──────────────────────
{
  const longBody = "interested. ".repeat(50); // ~600 chars
  const first = buildFirstAlertText({
    kind: "outreach_reply",
    fromName: "Dean Womack",
    fromEmail: "dean@acmehomes.com",
    company: "Acme Homes",
    subject: "Re: a 30-second proposal",
    body: longBody,
  });
  ok(first.includes("Dean Womack") && first.includes("Acme Homes"), "push #1 carries sender + company");
  ok(first.includes("§5.5"), "push #1 announces the §5.5 draft");
  const excerptLine = first.split("\n")[3] ?? "";
  ok(excerptLine.length <= 81, `push #1 body excerpt capped at ~80 chars (got ${excerptLine.length})`);

  const hugeDraft = "x".repeat(3000);
  const second = buildDraftAlertText({
    fromName: "Dean Womack",
    company: "Acme Homes",
    draft: hugeDraft,
    gmailThreadId: "18c2f0abc",
  });
  const draftPortion = second.split("\n\n")[1] ?? "";
  ok(draftPortion.length <= DRAFT_PUSH_CAP, `push #2 draft capped at ${DRAFT_PUSH_CAP} chars (got ${draftPortion.length})`);
  ok(second.includes("mail.google.com"), "push #2 carries the Gmail deep link");

  const warn = buildBreakerAlertText({ rate: 0.05, bounces: 2, sent: 40, date: "2026-07-03" });
  ok(warn.includes("5.0%") && warn.includes("2") && warn.includes("40"), "breaker warn carries rate + counts");
  ok(warn.includes("停止"), "breaker warn recommends stopping sends");
}

// ── 7. §5.5 template fidelity + prompt safety rails ──────────────────────────
{
  ok(FOUNDING_REPLY_TEMPLATE.includes("Free for 60 days, no card"), "§5.5: free 60 days present");
  ok(
    FOUNDING_REPLY_TEMPLATE.includes("Pro $29/mo (vs $49) or Team $99/mo (vs $149)"),
    "§5.5: founding rates verbatim",
  );
  ok(FOUNDING_REPLY_TEMPLATE.includes("Send me one lot"), "§5.5: one-lot CTA present");
  ok(FOUNDING_REPLY_TEMPLATE.trim().endsWith("— Shoji"), "§5.5: signs off as Shoji");

  const prompt = buildReplyDraftPrompt({
    kind: "outreach_reply",
    fromName: "Dean Womack",
    fromEmail: "dean@acmehomes.com",
    company: "Acme Homes",
    subject: "Re: proposal",
    body: "This looks interesting. What happens after the trial?",
    todayJST: "2026-07-03",
  });
  ok(prompt.includes(FOUNDING_REPLY_TEMPLATE), "prompt embeds §5.5 verbatim");
  ok(prompt.includes("never invent"), "prompt forbids fabrication");
  for (const w of ["sell more", "disrupting", "seamless"]) {
    ok(prompt.includes(`"${w}"`), `prompt bans "${w}" (message_library 禁止語)`);
  }
  ok(REPLY_BANNED_WORDS.includes("AI-powered"), "banned words inherit content-quality list");
}

// ── 8. header/date helpers ───────────────────────────────────────────────────
{
  const p = parseFromHeader('"Dean Womack" <Dean@AcmeHomes.com>');
  ok(p.email === "Dean@AcmeHomes.com" && p.name === "Dean Womack", "From header parsed");
  const bare = parseFromHeader("dean@acmehomes.com");
  ok(bare.email === "dean@acmehomes.com", "bare From parsed");

  const { date, startUtcIso } = jstToday(new Date("2026-07-03T02:00:00Z")); // 11:00 JST
  ok(date === "2026-07-03", "JST date for 02:00Z is same calendar day");
  ok(startUtcIso === "2026-07-02T15:00:00.000Z", "JST midnight = 15:00Z previous day");
  const early = jstToday(new Date("2026-07-02T16:30:00Z")); // 01:30 JST on the 3rd
  ok(early.date === "2026-07-03", "JST date rolls over at 15:00Z");
}

console.log(`reply-watch.test.ts: all ${passed} assertions passed`);
