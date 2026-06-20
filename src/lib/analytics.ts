import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";

// Server-only client. SUPABASE_SERVICE_ROLE_KEY bypasses RLS (analytics_events
// has SELECT-only RLS and no INSERT policy by design), and is never exposed to
// the browser — insertEvent is only called from server route handlers.
function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Non-blocking best-effort funnel event insert.
 * Never throws — failures are logged and swallowed so user flows are never blocked.
 * For Stripe webhook events, pass stripeEventId to deduplicate retries via UNIQUE constraint
 * (upsert with ignoreDuplicates so 23505 never fires).
 *
 * The write is scheduled via next/server `after()` so it runs AFTER the response
 * is flushed but the serverless function stays alive until it completes. The
 * previous fire-and-forget `query.then(...)` was dispatched but never awaited, so
 * on Vercel the lambda froze right after returning the response and the in-flight
 * insert was dropped every time — leaving analytics_events empty despite the
 * service_role key correctly bypassing RLS.
 */
export function insertEvent(
  eventName: string,
  userId: string | null,
  opts?: { metadata?: Record<string, unknown>; stripeEventId?: string },
): void {
  const row = {
    event_name: eventName,
    user_id: userId ?? null,
    metadata: opts?.metadata ?? {},
    ...(opts?.stripeEventId ? { stripe_event_id: opts.stripeEventId } : {}),
  };

  const flush = async (): Promise<void> => {
    try {
      const db = adminDb();
      const { error } = opts?.stripeEventId
        ? await db
            .from("analytics_events")
            .upsert(row, { onConflict: "stripe_event_id", ignoreDuplicates: true })
        : await db.from("analytics_events").insert(row);
      if (error) console.error("[analytics]", eventName, error.message);
    } catch (e) {
      console.error("[analytics]", eventName, String(e));
    }
  };

  try {
    // Keep the function alive past the response so the insert actually lands.
    after(flush);
  } catch {
    // after() is only valid inside a request scope; outside one (should not
    // happen for current callers) fall back to a best-effort detached write.
    void flush();
  }
}
