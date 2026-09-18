/**
 * Landing-page funnel destinations — the single place these are typed.
 * Guarded by src/app/lp-guards.test.ts (npm test). Fishing-pond mode
 * (DEC-0815B): /try is the primary entrance (no signup), a plain
 * /login?tab=signup is the free account (3/month, no card), and ONLY the
 * Pro card may carry ?plan=pro (the paid trial). /pricing does not exist —
 * the anchor is /#pricing.
 */
export const LP_ROUTES = {
  try: "/try",
  signupFree: "/login?tab=signup",
  signupPro: "/login?tab=signup&plan=pro",
  /** Team CTA: signed-out visitors go through /login and straight to checkout after auth. */
  signupTeam: "/login?plan=team",
  signin: "/login",
  dashboard: "/dashboard",
  pricing: "/#pricing",
  livePortal: "/s/nfhkewvz",
  fairUse: "/terms#fair-use",
  blog: "/blog",
  partners: "/partners",
  terms: "/terms",
  privacy: "/privacy",
} as const;
