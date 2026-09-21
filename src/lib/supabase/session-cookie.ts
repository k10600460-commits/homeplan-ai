/**
 * Cheap, network-free "is there a Supabase session?" check from cookie
 * names only. Used by the landing page (server) to pick the nav label —
 * "Sign in" vs "Dashboard" — without shipping the Supabase browser client
 * to every visitor or firing an auth request per page view.
 *
 * This is a UI hint, not authorization: /dashboard still verifies the
 * session for real. @supabase/ssr stores the session as
 * `sb-<project-ref>-auth-token`, chunked into `.0`, `.1`, … when large.
 * The PKCE `…-auth-token-code-verifier` cookie is deliberately excluded.
 */
const SESSION_COOKIE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/;

export function hasSupabaseSessionCookie(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some((c) => SESSION_COOKIE.test(c.name));
}
