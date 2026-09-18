/**
 * Signup-tab copy must follow the ?plan= param exactly.
 * Run with: npx tsx src/lib/signup-copy.test.ts
 *
 * Why this exists: on 2026-09-18 the free signup pane still rendered a
 * "Start Free Trial →" submit button under a "No credit card required"
 * heading (login/page.tsx:330 — PR #51 fixed the heading and bullets but
 * missed the button and the sign-in tab's switch link). A builder reads
 * "no card", then is asked to start a trial. This pins every string.
 */
import assert from "node:assert/strict";
import { isPaidSignupPlan, signupCopy } from "./signup-copy";

function allText(c: ReturnType<typeof signupCopy>): string {
  return [c.tabLabel, c.heading, c.sub, c.submit, c.switchToSignup, ...c.bullets].join(" | ");
}

// ── Free signup (no ?plan) ──────────────────────────────────────────
{
  const c = signupCopy(null);
  const all = allText(c);
  assert.equal(c.paid, false);
  assert.equal(c.submit, "Create free account →");
  assert.equal(c.tabLabel, "Create free account");
  assert.equal(c.switchToSignup, "Create a free account");
  assert.doesNotMatch(all, /trial/i, "free signup copy must never mention a trial");
  assert.doesNotMatch(all, /14 days|14-day/i, "free signup copy must never mention 14 days");
  assert.doesNotMatch(all, /\$49|\$149/, "free signup copy must never show a price");
  assert.doesNotMatch(all, /unlimited/i, "Unlimited is Team-only (PLAN_LIMITS)");
  assert.match(all, /No credit card required/);
  assert.match(all, /3 proposals a month/);
}

// Unknown plan values are treated as a free signup, never as a paid trial.
{
  assert.equal(isPaidSignupPlan("enterprise"), false);
  assert.equal(isPaidSignupPlan(""), false);
  assert.equal(isPaidSignupPlan(null), false);
  assert.equal(signupCopy("enterprise").submit, "Create free account →");
}

// ── Pro trial (?plan=pro) ───────────────────────────────────────────
{
  const c = signupCopy("pro");
  const all = allText(c);
  assert.equal(c.paid, true);
  assert.equal(isPaidSignupPlan("pro"), true);
  assert.equal(c.submit, "Start free trial →");
  assert.match(all, /14 days free, then \$49\/month/);
  assert.match(all, /100 proposals a month/, "Pro = 100/month (PLAN_LIMITS.pro)");
  assert.doesNotMatch(all, /unlimited/i, "Unlimited is Team-only");
  assert.doesNotMatch(all, /\$149/);
}

// ── Team trial (?plan=team) ─────────────────────────────────────────
{
  const c = signupCopy("team");
  const all = allText(c);
  assert.equal(c.paid, true);
  assert.equal(c.submit, "Start free trial →");
  assert.match(all, /14 days free, then \$149\/month/);
  assert.match(all, /Unlimited proposals \(fair use\)/);
  assert.match(all, /White-label PDF export/);
  assert.doesNotMatch(all, /\$49\//);
}

console.log("signup-copy.test.ts: all assertions passed ✅");
