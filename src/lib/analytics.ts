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
 * For Stripe webhook events, pass stripeEventId to deduplicate retries via UNIQUE constraint
 * (upsert with ignoreDuplicates so 23505 never fires).
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

  const query = opts?.stripeEventId
    ? adminDb()
        .from("analytics_events")
        .upsert(row, { onConflict: "stripe_event_id", ignoreDuplicates: true })
    : adminDb().from("analytics_events").insert(row);

  query.then(
    (result) => {
      if (result.error) console.error("[analytics]", eventName, result.error.message);
    },
    (e) => console.error("[analytics]", eventName, String(e)),
  );
}
