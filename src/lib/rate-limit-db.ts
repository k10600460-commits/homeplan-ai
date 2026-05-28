import { createClient as createAdmin } from "@supabase/supabase-js";

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds until the window resets
}

/**
 * Shared, cross-instance rate limiter backed by Postgres.
 *
 * identifier — unique key (e.g. `generate:user:<uid>`, `checkout:ip:<ip>`)
 * options.limit      — max requests allowed per window
 * options.windowSec  — window size in seconds
 *
 * Fails open (allows) if the RPC is unavailable, with a console.error log.
 */
export async function checkRateLimitDB(
  identifier: string,
  options: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key:        identifier,
      _window_sec: options.windowSec,
      _limit:      options.limit,
    });

    if (error) {
      console.error("[rate-limit-db] RPC error:", error);
      return { allowed: true, retryAfter: 0 };
    }

    const result = data as { allowed: boolean; retry_after: number };
    return {
      allowed:    result.allowed,
      retryAfter: result.retry_after ?? options.windowSec,
    };
  } catch (err) {
    console.error("[rate-limit-db] Unexpected error:", err);
    return { allowed: true, retryAfter: 0 };
  }
}
