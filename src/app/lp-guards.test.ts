/**
 * Landing-page funnel guards — the things that must not regress
 * (fishing-pond DEC-0815B + the 2026-09-18 funnel fixes), made executable.
 * Run with: npx tsx src/app/lp-guards.test.ts
 *
 * Guarded:
 *  1. Funnel routes: primary CTA → /try, secondary → /login?tab=signup with
 *     NO plan param, Pro → /login?tab=signup&plan=pro, pricing anchor → /#pricing,
 *     live portal example → /s/nfhkewvz.
 *  2. Nobody links to /pricing (the route does not exist — 404).
 *  3. LP hrefs go through LP_ROUTES (no hand-typed paid-signup links).
 *  4. Speed: the LP ships neither the Supabase browser client nor a JS reveal.
 *  5. EN/ES copy has identical structure (DESIGN.md invariant).
 *  6. Pricing copy mirrors PLAN_LIMITS: Free 3/mo + no card, Pro 100/mo,
 *     "Unlimited" only on Team; legal gating strings intact.
 *  7. HUMANIZE banned words never ship in EN copy.
 *  8. The signup page renders its copy via signupCopy() only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { T } from "./lp-copy";
import { LP_ROUTES } from "./lp-routes";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, rel), "utf8");

// 1. Funnel routes
assert.equal(LP_ROUTES.try, "/try");
assert.equal(LP_ROUTES.signupFree, "/login?tab=signup");
assert.doesNotMatch(LP_ROUTES.signupFree, /plan=/, "free signup must not carry a plan param");
assert.equal(LP_ROUTES.signupPro, "/login?tab=signup&plan=pro");
assert.equal(LP_ROUTES.pricing, "/#pricing");
assert.equal(LP_ROUTES.livePortal, "/s/nfhkewvz");

// 2. /pricing is a 404 — nothing may link to it
for (const f of ["HomePageClient.tsx", "login/page.tsx", "blog/page.tsx", "blog/[slug]/page.tsx", "try/TryClient.tsx"]) {
  assert.doesNotMatch(src(f), /href=["']\/pricing["']/, `${f} links to /pricing (404)`);
}

// 3. LP funnel hrefs go through LP_ROUTES
const lp = src("HomePageClient.tsx");
assert.doesNotMatch(lp, /["'`]\/login\?tab=signup&plan=/, "hand-typed paid signup href in LP — use LP_ROUTES");
assert.ok(lp.includes("LP_ROUTES.try"), "hero primary CTA must use LP_ROUTES.try");
assert.ok(lp.includes("LP_ROUTES.signupFree"), "secondary CTA must use LP_ROUTES.signupFree");
assert.ok(lp.includes("LP_ROUTES.signupPro"), "Pro CTA must use LP_ROUTES.signupPro");

// 4. Speed guards
assert.doesNotMatch(lp, /supabase\/client/, "LP must not ship the Supabase browser client (nav state comes from the server)");
assert.doesNotMatch(lp, /IntersectionObserver/, "entrance reveal must be CSS scroll-driven, not JS");
assert.doesNotMatch(lp, /translateY\(22px\)/, "no JS-driven initial opacity:0 in SSR HTML");

// 5. EN/ES structural parity
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape(o[k])]));
  }
  return typeof v;
}
assert.deepEqual(shape(T.en), shape(T.es), "T.en and T.es must have identical structure");

// 6. Pricing copy mirrors PLAN_LIMITS
for (const lang of ["en", "es"] as const) {
  const p = T[lang].pricing;
  assert.match(p.free.note, /no credit card|sin tarjeta/i, `${lang}: Free note must say no card`);
  assert.ok(p.free.features.some((f) => /^3 /.test(f)), `${lang}: Free = 3/month`);
  assert.ok(p.pro.features.some((f) => /100/.test(f)), `${lang}: Pro = 100/month`);
  const notTeam = [...p.free.features, ...p.pro.features, ...p.custom.features, p.free.note, p.pro.note].join(" ");
  assert.doesNotMatch(notTeam, /unlimited|ilimitad/i, `${lang}: Unlimited is Team-only`);
  assert.ok(p.team.features.some((f) => /unlimited|ilimitad/i.test(f)), `${lang}: Team says unlimited (fair use)`);
}
assert.ok(T.en.pricing.pro.features.some((f) => /requires your MLS license/.test(f)), "MLS legal gating text");
assert.ok(T.en.pricing.pro.features.some((f) => /Powered by SplanAI footer included/.test(f)), "Pro PDF footer text");
assert.ok(lp.includes("/terms#fair-use"), "fair-use policy link");

// 7. HUMANIZE — banned words never ship in EN copy
const banned = /AI-powered|revolutionary|game-changing|seamless|cutting-edge|effortless/i;
assert.doesNotMatch(JSON.stringify(T.en), banned, "HUMANIZE banned word in EN copy");
assert.doesNotMatch(lp.replace(/\/\/.*$/gm, ""), banned, "HUMANIZE banned word in LP markup");

// 8. Signup page copy comes from signupCopy() only
const login = src("login/page.tsx");
assert.ok(login.includes("signupCopy("), "login page must render signup copy via signupCopy()");
assert.doesNotMatch(login, /Start Free Trial|14 days free|Unlimited|Start your free trial/, "hand-typed plan copy in login page");

console.log("lp-guards.test.ts: all assertions passed ✅");
