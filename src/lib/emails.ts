import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "SplanAI <noreply@splanai.com>";
const REPLY_TO = "hello@splanai.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
const CONTENT_OPS_ALERT_TO = process.env.DAILY_BRIEF_TO ?? "hello@splanai.com";

// CAN-SPAM §7(a)(5): valid physical postal address required in all commercial email.
// Set PHYSICAL_ADDRESS in the environment (Vercel Production, server-only — keep it
// out of the client bundle and out of git). While unset it stays the placeholder,
// which the nurture send route's 503 gate detects to block commercial sends.
// Currently the founder's Osaka home address (verification stage); swap to a US
// address at volume / US incorporation.
export const PHYSICAL_ADDRESS =
  process.env.PHYSICAL_ADDRESS ?? "<<FILL: physical postal address>>";

// Postal line without the leading brand, for footers that already render "SplanAI"
// (the transactional © line) — avoids "SplanAI" appearing twice. Strips a leading
// "SplanAI," if present; otherwise returns PHYSICAL_ADDRESS unchanged.
const POSTAL_ADDRESS_LINE = PHYSICAL_ADDRESS.replace(/^\s*SplanAI,\s*/i, "");

function footerHtml(url = APP_URL): string {
  return `<p style="color:#cbd5e1;font-size:12px;margin-top:4px">© 2026 SplanAI · <a href="${url}" style="color:#94a3b8">splanai.com</a><br>${POSTAL_ADDRESS_LINE}</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[c] ?? c));
}

// SECURITY: strip CR/LF and other control characters from any value placed in
// an email HEADER (subject / replyTo / to / from-name) — prevents header
// injection ("buyer@x.com\r\nBcc: victim@...").
export function sanitizeEmailHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim();
}

// SECURITY: user-supplied values embedded in href attributes must not be able
// to smuggle a scheme (javascript:, data:, ...). Only values matching these
// strict shapes are linked with the fixed mailto:/tel: scheme; anything else
// returns null and the caller renders plain (escaped) text instead.
const SAFE_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SAFE_TEL_RE = /^\+?[0-9()\-.\s]{3,30}$/;

export function safeMailtoHref(email: string | null | undefined): string | null {
  if (!email || !SAFE_EMAIL_RE.test(email)) return null;
  return `mailto:${email}`;
}

export function safeTelHref(phone: string | null | undefined): string | null {
  if (!phone || !SAFE_TEL_RE.test(phone)) return null;
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export async function sendContentOpsAlertEmail(subject: string, lines: string[]) {
  await resend.emails.send({
    from: FROM,
    to: CONTENT_OPS_ALERT_TO,
    replyTo: REPLY_TO,
    subject: `[SplanAI ContentOps] ${sanitizeEmailHeader(subject)}`,
    html: `
<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">ContentOps Alert</h1>
  <p style="color:#475569;margin-bottom:16px">${escapeHtml(subject)}</p>
  <ul style="color:#475569;padding-left:20px;margin-bottom:24px">
    ${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}
  </ul>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

export async function sendWelcomeEmail(to: string) {
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Welcome to SplanAI — your first floor plan is free",
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:24px;font-weight:800;margin-bottom:8px">Welcome to Splan<span style="color:#3b82f6">AI</span> 🏠</h1>
  <p style="color:#475569;margin-bottom:24px">You're ready to generate AI floor plans in 30 seconds — no architect needed.</p>
  <p style="margin-bottom:8px"><strong>Your Free plan includes:</strong></p>
  <ul style="color:#475569;padding-left:20px;margin-bottom:24px">
    <li>3 floor plan generations per month</li>
    <li>SplanAI branded PDF export</li>
    <li>Neighborhood data (Google Maps + RentCast)</li>
  </ul>
  <a href="${APP_URL}" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Generate Your First Plan →</a>
  <p style="margin-top:32px;color:#94a3b8;font-size:13px">Need more? <a href="${APP_URL}#pricing" style="color:#3b82f6">Upgrade to Pro</a> for 100 floor plan generations/month, your logo on PDFs, and priority support.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

// Post-checkout welcome (paid plans) — template only, NOT WIRED ANYWHERE.
// Do not call this from checkout/webhook code without explicit approval from
// Shoji (sending = external communication, human sign-off required).
// SECURITY: nothing user-supplied is interpolated below (`plan` is a closed
// union, all copy is static). If a name/company is ever added, run it through
// escapeHtml() for the body and sanitizeEmailHeader() for any header field.
export async function sendCheckoutWelcomeEmail(to: string, plan: "pro" | "team" = "pro") {
  const planLabel = plan === "team" ? "Team" : "Pro";
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `You're in — 3 steps to your first proposal`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <p style="color:#475569;margin-bottom:16px">Hi,</p>
  <p style="color:#475569;margin-bottom:16px">Shoji here — I build SplanAI. Thanks for going ${planLabel}.</p>
  <p style="color:#475569;margin-bottom:8px">Three steps and you're getting real value out of it:</p>
  <ol style="color:#475569;padding-left:20px;margin-bottom:24px">
    <li style="margin-bottom:8px"><strong>Create your first proposal.</strong> Type the lot address, set a budget. Three concepts come back in about 30 seconds.</li>
    <li style="margin-bottom:8px"><strong>Add your logo.</strong> Every PDF and client portal goes out under your brand, not ours.</li>
    <li><strong>Connect your MLS.</strong> Real lot data flows straight into your proposals.</li>
  </ol>
  <a href="${APP_URL}/generate" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Create your first proposal →</a>
  <p style="margin-top:24px;color:#475569">Stuck anywhere, or something feels off? Reply to this email — I read every one.</p>
  <p style="color:#475569">— Shoji</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

export async function sendTrialReminderEmail(to: string, trialEndDate: string, plan: "pro" | "team" = "pro") {
  const planLabel = plan === "team" ? "Team" : "Pro";
  const price = plan === "team" ? "$149/month" : "$49/month";
  const generationsLine = plan === "team"
    ? "don't lose access to unlimited floor plan generations and branded PDFs."
    : "don't lose access to 100 floor plan generations/month and branded PDFs.";
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `Your SplanAI ${planLabel} trial ends in 3 days`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your free trial ends on ${trialEndDate} ⏰</h1>
  <p style="color:#475569;margin-bottom:24px">You've been using SplanAI ${planLabel} — ${generationsLine}</p>
  <p style="color:#475569;margin-bottom:24px">After your trial, you'll automatically continue at <strong>${price}</strong> — or you can cancel anytime from your dashboard with one click.</p>
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Manage Your Subscription →</a>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

export async function sendFirstPlanFollowupEmail(to: string) {
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Did you send the PDF to your client?",
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your floor plans are ready 🏗️</h1>
  <p style="color:#475569;margin-bottom:16px">You just generated your first AI floor plan proposals with SplanAI. Great first step!</p>
  <p style="color:#475569;margin-bottom:24px"><strong>Next move:</strong> Send the PDF or share the link with your client while the conversation is fresh. Builders who follow up within 24 hours close 2× more deals.</p>
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">View Your Shared Links →</a>
  <p style="margin-top:24px;color:#94a3b8;font-size:13px">You'll get a notification the moment your client opens the link.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

export async function sendCancellationEmail(to: string, periodEndDate: string, plan: "pro" | "team" = "pro") {
  const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
  const planLabel = plan === "team" ? "Team" : "Pro";
  const generationsItem = plan === "team"
    ? "Generate unlimited floor plans"
    : "Generate up to 100 floor plans per month";
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `Your SplanAI ${planLabel} access continues until ${periodEndDate}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your ${planLabel} access is still active 🏠</h1>
  <p style="color:#475569;margin-bottom:16px">We received your cancellation request. Your SplanAI ${planLabel} subscription remains <strong>fully active until ${periodEndDate}</strong>.</p>
  <p style="color:#475569;margin-bottom:16px">Until then you can still:</p>
  <ul style="color:#475569;padding-left:20px;margin-bottom:24px">
    <li>${generationsItem}</li>
    <li>Export branded PDFs with your logo</li>
    <li>Share client links and track views</li>
    <li>Access neighborhood and market data</li>
  </ul>
  <p style="color:#475569;margin-bottom:24px">Changed your mind? Reactivate anytime from your dashboard — no new trial required.</p>
  <a href="${APP}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Go to Dashboard &#8594;</a>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml(APP)}
</div>`,
  }).catch(console.error);
}


export interface InquiryData {
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  planIndex: number | null;
  message: string | null;
  portalSlug: string;
  portalUrl: string;
}

export async function sendInquiryNotificationEmail(to: string, data: InquiryData) {
  const planLabel = data.planIndex != null ? `Plan ${data.planIndex + 1}` : "a plan";
  const contactLine = [data.buyerEmail, data.buyerPhone].filter(Boolean).join(" · ");
  // SECURITY: buyerName / buyerEmail / buyerPhone / message come from the PUBLIC
  // portal inquiry form — escape everything before embedding in HTML so a buyer
  // cannot inject markup (fake links / phishing copy) into the builder's inbox.
  const safeName = data.buyerName ? escapeHtml(data.buyerName) : null;
  const safeEmail = data.buyerEmail ? escapeHtml(data.buyerEmail) : null;
  const safePhone = data.buyerPhone ? escapeHtml(data.buyerPhone) : null;
  const safeMessage = data.message ? escapeHtml(data.message) : null;
  // SECURITY: buyerEmail goes into the Reply-To HEADER — CRLF-sanitize and only
  // use it when it is a plain well-formed address; otherwise fall back.
  const headerEmail = data.buyerEmail ? sanitizeEmailHeader(data.buyerEmail) : null;
  const replyTo = headerEmail && safeMailtoHref(headerEmail) ? headerEmail : REPLY_TO;
  // SECURITY: user input inside href must not smuggle a scheme — link only
  // strictly-shaped values, otherwise render plain escaped text with no anchor.
  const mailHref = safeMailtoHref(data.buyerEmail);
  const telHref = safeTelHref(data.buyerPhone);
  await resend.emails.send({
    from: FROM,
    to,
    replyTo,
    subject: `New inquiry on your SplanAI proposal`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:4px">New Inquiry 🏠</h1>
  <p style="color:#475569;margin-bottom:24px">A potential buyer expressed interest in <strong>${planLabel}</strong> on your SplanAI proposal.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    ${safeName ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;width:110px">Name</td><td style="padding:8px 0;font-weight:600">${safeName}</td></tr>` : ""}
    ${safeEmail ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Email</td><td style="padding:8px 0">${mailHref ? `<a href="${mailHref}" style="color:#3b82f6">${safeEmail}</a>` : safeEmail}</td></tr>` : ""}
    ${safePhone ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Phone</td><td style="padding:8px 0">${telHref ? `<a href="${telHref}" style="color:#3b82f6">${safePhone}</a>` : safePhone}</td></tr>` : ""}
    <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px">Interested in</td><td style="padding:8px 0;font-weight:600">${planLabel}</td></tr>
    ${safeMessage ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;vertical-align:top">Message</td><td style="padding:8px 0;color:#475569">${safeMessage}</td></tr>` : ""}
  </table>
  ${contactLine && mailHref ? `<a href="${mailHref}" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Reply to Buyer →</a>` : ""}
  <p style="margin-top:24px;color:#94a3b8;font-size:13px">View the proposal: <a href="${data.portalUrl}" style="color:#3b82f6">${data.portalUrl}</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

export async function sendTeamInviteEmail(to: string, ownerEmail: string, inviteUrl: string) {
  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `You've been invited to join a SplanAI Team`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:24px;font-weight:800;margin-bottom:8px">You're invited to Splan<span style="color:#3b82f6">AI</span> Team 🏠</h1>
  <p style="color:#475569;margin-bottom:24px"><strong>${escapeHtml(ownerEmail)}</strong> has invited you to join their SplanAI Team — AI floor plan generation for home builders.</p>
  <p style="margin-bottom:8px"><strong>With Team access you get:</strong></p>
  <ul style="color:#475569;padding-left:20px;margin-bottom:24px">
    <li>Unlimited AI floor plan generations</li>
    <li>Branded PDF exports with your company logo</li>
    <li>Client sharing portal &amp; tracking</li>
    <li>Neighborhood &amp; market data</li>
    <li>MLS lot data connection</li>
  </ul>
  <a href="${inviteUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Accept Invitation →</a>
  <p style="margin-top:24px;color:#94a3b8;font-size:13px">This invitation link is unique to you. If you didn't expect this email, you can ignore it.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`,
  }).catch(console.error);
}

// ── Pulse weekly digest (P-A) — wired to /api/cron/pulse-digest, SEND OFF ─────
// Sending for /pulse subscribers stays OFF by decision: the cron builds every
// digest from pulse_subscribers × the latest pulse_snapshots row and stops
// right before the Resend call unless PULSE_DIGEST_ENABLED === 'true' (env is
// intentionally unset everywhere → OFF; it logs "would send N" instead).
// Before flipping the flag a human must approve double opt-in + CAN-SPAM
// review. unsubscribeUrl → GET /api/pulse/unsubscribe?token=<HMAC> (live).
export function buildPulseDigestEmail(params: {
  /** null = all-metros digest */
  metroName: string | null;
  ratePct: number;
  rateAsOf: string; // ISO date of the PMMS observation
  /** Pre-formatted, already-sourced permit line(s); null renders nothing. */
  permitsLine: string | null;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const scope = params.metroName ? `${params.metroName} ` : "";
  const subject = sanitizeEmailHeader(
    `${scope}builder market pulse — 30yr fixed at ${params.ratePct.toFixed(2)}%`,
  );
  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:20px;font-weight:800;margin-bottom:8px">${escapeHtml(scope)}Builder Market Pulse</h1>
  <p style="color:#475569;margin-bottom:16px">30-year fixed average: <strong>${escapeHtml(params.ratePct.toFixed(2))}%</strong> (Freddie Mac PMMS via FRED, as of ${escapeHtml(params.rateAsOf)}).</p>
  ${params.permitsLine ? `<p style="color:#475569;margin-bottom:16px">${escapeHtml(params.permitsLine)}</p>` : ""}
  <p style="color:#475569;margin-bottom:24px">Payment tables and sources: <a href="${APP_URL}/pulse" style="color:#3b82f6">splanai.com/pulse</a></p>
  <p style="margin-top:24px;color:#94a3b8;font-size:13px"><a href="${params.unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  ${footerHtml()}
</div>`;
  return { subject, html };
}
