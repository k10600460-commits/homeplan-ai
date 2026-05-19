import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "SplanAI <noreply@splanai.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";

export async function sendWelcomeEmail(to: string) {
  await resend.emails.send({
    from: FROM,
    to,
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
  <p style="margin-top:32px;color:#94a3b8;font-size:13px">Need more? <a href="${APP_URL}#pricing" style="color:#3b82f6">Upgrade to Pro</a> for unlimited plans, your logo on PDFs, and priority support.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#cbd5e1;font-size:12px">© 2026 SplanAI · <a href="${APP_URL}" style="color:#94a3b8">splanai.com</a></p>
</div>`,
  }).catch(console.error);
}

export async function sendTrialReminderEmail(to: string, trialEndDate: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your SplanAI Pro trial ends in 3 days",
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your free trial ends on ${trialEndDate} ⏰</h1>
  <p style="color:#475569;margin-bottom:24px">You've been using SplanAI Pro — don't lose access to unlimited plans and branded PDFs.</p>
  <p style="color:#475569;margin-bottom:24px">After your trial, you'll automatically continue at <strong>$49/month</strong> — or you can cancel anytime from your dashboard with one click.</p>
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Manage Your Subscription →</a>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#cbd5e1;font-size:12px">© 2026 SplanAI · <a href="${APP_URL}" style="color:#94a3b8">splanai.com</a></p>
</div>`,
  }).catch(console.error);
}

export async function sendFirstPlanFollowupEmail(to: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Did you send the PDF to your client?",
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your floor plans are ready 🏗️</h1>
  <p style="color:#475569;margin-bottom:16px">You just generated your first AI floor plan proposals with SplanAI. Great first step!</p>
  <p style="color:#475569;margin-bottom:24px"><strong>Next move:</strong> Send the PDF or share the link with your client while the conversation is fresh. Builders who follow up within 24 hours close 2× more deals.</p>
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">View Your Shared Links →</a>
  <p style="margin-top:24px;color:#94a3b8;font-size:13px">You'll get a notification the moment your client opens the link.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#cbd5e1;font-size:12px">© 2026 SplanAI · <a href="${APP_URL}" style="color:#94a3b8">splanai.com</a></p>
</div>`,
  }).catch(console.error);
}

export async function sendCancellationEmail(to: string, periodEndDate: string) {
  const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your SplanAI Pro access continues until ${periodEndDate}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your Pro access is still active 🏠</h1>
  <p style="color:#475569;margin-bottom:16px">We received your cancellation request. Your SplanAI Pro subscription remains <strong>fully active until ${periodEndDate}</strong>.</p>
  <p style="color:#475569;margin-bottom:16px">Until then you can still:</p>
  <ul style="color:#475569;padding-left:20px;margin-bottom:24px">
    <li>Generate unlimited floor plans</li>
    <li>Export branded PDFs with your logo</li>
    <li>Share client links and track views</li>
    <li>Access neighborhood and market data</li>
  </ul>
  <p style="color:#475569;margin-bottom:24px">Changed your mind? Reactivate anytime from your dashboard — no new trial required.</p>
  <a href="${APP}/dashboard" style="display:inline-block;background:#3b82f6;color:white;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px">Go to Dashboard &#8594;</a>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#cbd5e1;font-size:12px">&#169; 2026 SplanAI &middot; <a href="${APP}" style="color:#94a3b8">splanai.com</a></p>
</div>`,
  }).catch(console.error);
}
