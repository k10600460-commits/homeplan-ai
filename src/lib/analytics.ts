import { createClient } from "@supabase/supabase-js";

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Non-blocking best-effort funnel event insert.
 * Never throws — failures are logged and swallowed so user flows are never blocked.
 * For Stripe webhook events, pass stripeEventId to deduplicate retries via UNIQUE constraint.
 */
export function insertEvent(
  eventName: string,
  userId: string | null,
  opts?: { metadata?: Record<string, unknown>; stripeEventId?: string },
): void {
  adminDb()
    .from("analytics_events")
    .insert({
      event_name: eventName,
      user_id: userId ?? null,
      metadata: opts?.metadata ?? {},
      ...(opts?.stripeEventId ? { stripe_event_id: opts.stripeEventId } : {}),
    })
    .then(
      () => {},
      (e) => console.error("[analytics]", eventName, String(e)),
    );
}
