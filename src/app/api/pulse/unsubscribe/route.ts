import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySignedPayload } from "@/lib/crypto";
import { insertEvent } from "@/lib/analytics";
import { PULSE_UNSUB_TOKEN_PURPOSE } from "@/lib/pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pulse/unsubscribe?token=<signed>
//
// One-click unsubscribe for the /pulse weekly digest (linked from every digest
// email + its List-Unsubscribe header). The token is an HMAC-signed payload
// bound to the subscriber email (crypto.signPayload — same key/format as the
// /try demo token), so the email address never appears in the URL and rows
// cannot be deleted by enumeration.
//
// Deliberate choices:
//   - GET performs the delete (spec: the link in the email must work with a
//     plain click, no form/JS). Idempotent — repeat clicks return the same page.
//   - Deletes ALL rows for the email (every metro): CAN-SPAM-safest reading of
//     "unsubscribe"; a subscriber can re-opt-in per metro on /pulse anytime.
//   - This route performs no external sends, so it is fully live (not behind
//     PULSE_DIGEST_ENABLED).

function htmlResponse(title: string, message: string, status = 200) {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center;color:#111827">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:12px">${title}</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.5">${message}</p>
  <p style="margin-top:24px"><a href="/pulse" style="color:#3b82f6;font-size:14px">Back to Builder Market Pulse</a></p>
</body></html>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";

  let payload: Record<string, unknown> | null = null;
  try {
    payload = token ? verifySignedPayload(token) : null;
  } catch (err) {
    // getKey() throws when AES_ENCRYPTION_KEY is missing — config error, not user error.
    console.error("[pulse-unsubscribe] token verification threw:", err instanceof Error ? err.message : String(err));
    return htmlResponse("Something went wrong", "We couldn't process this link right now. Please try again later.", 503);
  }

  const email =
    payload && payload.purpose === PULSE_UNSUB_TOKEN_PURPOSE && typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  if (!email) {
    return htmlResponse(
      "Invalid unsubscribe link",
      "This link is invalid or incomplete. Copy the full unsubscribe link from your digest email, or reply to any digest and we'll remove you manually.",
      400,
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[pulse-unsubscribe] missing Supabase env");
    return htmlResponse("Something went wrong", "We couldn't process this link right now. Please try again later.", 503);
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error, count } = await supabase
    .from("pulse_subscribers")
    .delete({ count: "exact" })
    .eq("email", email);

  if (error) {
    console.error("[pulse-unsubscribe] delete failed:", error.message);
    return htmlResponse("Something went wrong", "We couldn't process this link right now. Please try again later.", 503);
  }

  // No email/PII in analytics metadata — count only.
  insertEvent("pulse_unsubscribe", null, { metadata: { removed: count ?? 0 } });

  return htmlResponse(
    "You're unsubscribed.",
    "You won't receive the weekly builder market digest anymore. The pulse pages stay free at splanai.com/pulse if you ever want the numbers without the email.",
  );
}
