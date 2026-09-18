/**
 * hasSupabaseSessionCookie — cookie-name-only check used by the landing
 * page to pick the nav label ("Sign in" vs "Dashboard") on the server,
 * so the LP no longer ships the Supabase browser client or fires an
 * auth request on every view. It is a UI hint only: /dashboard still
 * authenticates for real.
 * Run with: npx tsx src/lib/supabase/session-cookie.test.ts
 */
import assert from "node:assert/strict";
import { hasSupabaseSessionCookie } from "./session-cookie";

const REF = "sabriblwzzsvxsfxoebe";

assert.equal(hasSupabaseSessionCookie([]), false, "no cookies → signed out");

assert.equal(
  hasSupabaseSessionCookie([{ name: `sb-${REF}-auth-token` }]),
  true,
  "unchunked @supabase/ssr session cookie → signed in",
);

assert.equal(
  hasSupabaseSessionCookie([{ name: `sb-${REF}-auth-token.0` }, { name: `sb-${REF}-auth-token.1` }]),
  true,
  "chunked session cookie (.0/.1 suffix per @supabase/ssr chunker) → signed in",
);

assert.equal(
  hasSupabaseSessionCookie([{ name: `sb-${REF}-auth-token-code-verifier` }]),
  false,
  "PKCE code-verifier cookie is not a session",
);

assert.equal(
  hasSupabaseSessionCookie([{ name: "_vcrcs" }, { name: "splanai_demo" }, { name: "sb-other" }]),
  false,
  "unrelated cookies → signed out",
);

console.log("session-cookie.test.ts: all assertions passed ✅");
