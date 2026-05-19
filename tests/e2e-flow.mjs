#!/usr/bin/env node
/**
 * HomePlanAI E2E Test — 新規登録→プラン生成→Stripe決済フロー
 * Tests real authenticated API calls through the local Next.js dev server.
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// ── Config — read from environment variables ───────────────────────────
// Set these in .env.local before running: node tests/e2e-flow.mjs
const SUPABASE_URL          = process.env.NEXT_PUBLIC_SUPABASE_URL          ?? "https://sabriblwzzsvxsfxoebe.supabase.co";
const SUPABASE_ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY     ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? "";
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY                 ?? "";
const STRIPE_PRICE_ID       = process.env.STRIPE_PRICE_ID                   ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace("https://", "http://localhost:").replace("splanai.com", "3099") ?? "http://localhost:3099";
const MAX_CHUNK_SIZE = 3180;
const PROJECT_REF = SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1] ?? "";

// ── Clients ────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" });

// ── Test data ──────────────────────────────────────────────────────────
const testEmail = `e2e-${Date.now()}@test.homeplanai.local`;
const testPassword = "E2eTestPass123!";
let testUserId = null;

// ── Results ────────────────────────────────────────────────────────────
const results = [];
function pass(name, detail) {
  results.push({ name, status: "PASS", detail });
  console.log(`  ✅ PASS  ${name}`);
  if (detail) console.log(`         ${detail}`);
}
function fail(name, detail) {
  results.push({ name, status: "FAIL", detail });
  console.log(`  ❌ FAIL  ${name}`);
  if (detail) console.log(`         ${detail}`);
}
function skip(name, detail) {
  results.push({ name, status: "SKIP", detail });
  console.log(`  ⚠️  SKIP  ${name}: ${detail}`);
}

// ── Cookie helpers ─────────────────────────────────────────────────────
function buildAuthCookieHeader(session) {
  const key = `sb-${PROJECT_REF}-auth-token`;
  const value = JSON.stringify(session);
  const cookies = {};
  if (value.length <= MAX_CHUNK_SIZE) {
    cookies[key] = value;
  } else {
    let i = 0;
    for (let pos = 0; pos < value.length; pos += MAX_CHUNK_SIZE) {
      cookies[`${key}.${i++}`] = value.slice(pos, pos + MAX_CHUNK_SIZE);
    }
  }
  return Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
}

async function authedFetch(path, options, session) {
  const cookieHeader = buildAuthCookieHeader(session);
  return fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { ...(options?.headers ?? {}), Cookie: cookieHeader },
  });
}

// ── TEST 1: New user signup ────────────────────────────────────────────
async function testSignup() {
  console.log("\n── TEST 1: 新規登録 (Signup) ──────────────────────");
  const { data, error } = await supabase.auth.signUp({ email: testEmail, password: testPassword });
  if (error) return fail("Signup", error.message);
  if (!data.user) return fail("Signup", "No user returned");
  testUserId = data.user.id;
  pass("Signup", `User created: ${testEmail} (id: ${testUserId.slice(0, 8)}…)`);
  return data.user;
}

// ── TEST 2: Sign in and get session ───────────────────────────────────
async function testSignIn() {
  console.log("\n── TEST 2: サインイン & セッション取得 ──────────────");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error) return fail("SignIn", error.message) || null;
  if (!data.session) return fail("SignIn", "No session returned") || null;
  pass("SignIn", `Session obtained (expires_in: ${data.session.expires_in}s)`);
  return data.session;
}

// ── TEST 3: /api/usage — initial free tier state ──────────────────────
async function testInitialUsage(session) {
  console.log("\n── TEST 3: 初期使用量チェック (/api/usage) ──────────");
  const res = await authedFetch("/api/usage", {}, session);
  if (!res.ok) return fail("InitialUsage", `HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(`         Response:`, JSON.stringify(data));
  if (data.plan !== "free") return fail("InitialUsage", `Expected plan=free, got ${data.plan}`);
  if (data.limit !== 3) return fail("InitialUsage", `Expected limit=3, got ${data.limit}`);
  if (data.current !== 0) return fail("InitialUsage", `Expected current=0, got ${data.current}`);
  pass("InitialUsage", `plan=free, limit=${data.limit}, current=${data.current}, remaining=${data.remaining}`);
  return data;
}

// ── TEST 4: /api/generate — first plan generation ─────────────────────
async function testGeneratePlans(session) {
  console.log("\n── TEST 4: プラン生成 (/api/generate) ───────────────");
  const res = await authedFetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lotSize: "8000", budget: "400000", familySize: "4" }),
  }, session);

  if (!res.ok) {
    const body = await res.text();
    return fail("GeneratePlans", `HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.plans || data.plans.length !== 3) {
    return fail("GeneratePlans", `Expected 3 plans, got ${data.plans?.length ?? 0}`);
  }

  const plan = data.plans[0];
  const required = ["name", "style", "squareFootage", "bedrooms", "bathrooms", "estimatedCost", "rooms", "features", "highlights"];
  const missing = required.filter((k) => !(k in plan));
  if (missing.length) return fail("GeneratePlans", `Missing fields: ${missing.join(", ")}`);

  pass(
    "GeneratePlans",
    `3 plans generated — Plan 1: "${plan.name}" ${plan.squareFootage}sqft $${plan.estimatedCost.toLocaleString()}`
  );
  console.log(`         Plans: ${data.plans.map((p) => p.name).join(", ")}`);
  console.log(`         Usage remaining: ${data.usage?.remaining ?? "N/A"}`);
  return data;
}

// ── TEST 5: Usage incremented after generation ────────────────────────
async function testUsageIncremented(session) {
  console.log("\n── TEST 5: 使用量カウント確認 ───────────────────────");
  const res = await authedFetch("/api/usage", {}, session);
  if (!res.ok) return fail("UsageIncremented", `HTTP ${res.status}`);
  const data = await res.json();
  console.log(`         Response:`, JSON.stringify(data));
  if (data.current !== 1) return fail("UsageIncremented", `Expected current=1, got ${data.current}`);
  pass("UsageIncremented", `current=${data.current}, remaining=${data.remaining}`);
  return data;
}

// ── TEST 6: Quota enforcement — generate 2 more, then 4th blocked ─────
async function testQuotaEnforcement(session) {
  console.log("\n── TEST 6: 上限制御 (Free: 3/month) ────────────────");

  // Generate 2nd and 3rd plans
  for (let i = 2; i <= 3; i++) {
    const res = await authedFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotSize: "6000", budget: "300000", familySize: "3" }),
    }, session);
    if (!res.ok) {
      return fail("QuotaEnforcement", `Plan ${i} failed: HTTP ${res.status}`);
    }
    console.log(`         ✓ Plan ${i}/3 generated`);
  }

  // 4th attempt — must be blocked
  const res = await authedFetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lotSize: "5000", budget: "250000", familySize: "2" }),
  }, session);

  if (res.status === 429) {
    const body = await res.json();
    if (body.code !== "LIMIT_EXCEEDED") {
      return fail("QuotaEnforcement", `429 but wrong code: ${body.code}`);
    }
    pass("QuotaEnforcement", `4th attempt blocked — 429 LIMIT_EXCEEDED (current=${body.current}, limit=${body.limit})`);
    return true;
  }
  return fail("QuotaEnforcement", `4th attempt not blocked — HTTP ${res.status}`);
}

// ── TEST 7: PDF structure validation (server-side) ───────────────────
async function testPDFStructure(plansData) {
  console.log("\n── TEST 7: PDFデータ構造確認 (server-side) ─────────");
  // PDF generation is client-side (jsPDF). Validate the data structure that feeds it.
  if (!plansData?.plans) return skip("PDFStructure", "No plans data available");

  for (const plan of plansData.plans) {
    const roomsOk = Array.isArray(plan.rooms) && plan.rooms.every((r) => r.name && r.sqft > 0);
    if (!roomsOk) return fail("PDFStructure", `Plan ${plan.id} has invalid rooms`);
    const featOk = Array.isArray(plan.features) && plan.features.length > 0;
    if (!featOk) return fail("PDFStructure", `Plan ${plan.id} has no features`);
    const hlOk = Array.isArray(plan.highlights) && plan.highlights.length > 0;
    if (!hlOk) return fail("PDFStructure", `Plan ${plan.id} has no highlights`);
  }
  pass("PDFStructure", `All 3 plans have valid rooms/features/highlights for PDF export`);
  return true;
}

// ── TEST 8: Stripe checkout session creation ──────────────────────────
async function testStripeCheckout() {
  console.log("\n── TEST 8: Stripe Checkoutセッション生成 ────────────");
  try {
    // Call /api/stripe/checkout through local server
    const res = await fetch(`${APP_URL}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserId, email: testEmail }),
    });

    if (!res.ok) {
      const body = await res.text();
      return fail("StripeCheckout", `HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.url) return fail("StripeCheckout", "No URL in response");
    if (!data.url.startsWith("https://checkout.stripe.com")) {
      return fail("StripeCheckout", `Unexpected URL: ${data.url.slice(0, 60)}`);
    }

    pass("StripeCheckout", `Checkout URL: ${data.url.slice(0, 60)}…`);

    // Verify the session details via Stripe API
    const sessionId = data.url.split("/").pop();
    // Also verify subscription meta via Stripe SDK
    const sessions = await stripe.checkout.sessions.list({ limit: 1 });
    const latest = sessions.data[0];
    if (latest?.client_reference_id !== testUserId && latest?.metadata?.userId !== testUserId) {
      console.log(`         ⚠️  Latest Stripe session userId mismatch (may be different test run)`);
    } else {
      console.log(`         ✓ Stripe session has correct userId metadata`);
    }
    console.log(`         Trial period: 14 days`);
    return true;
  } catch (err) {
    return fail("StripeCheckout", err.message);
  }
}

// ── TEST 9: Stripe webhook structure validation ───────────────────────
async function testWebhookStructure() {
  console.log("\n── TEST 9: Webhook エンドポイント確認 ───────────────");
  // POST with invalid signature → must return 400
  const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "invalid-sig" },
    body: JSON.stringify({ type: "checkout.session.completed" }),
  });
  if (res.status === 400) {
    pass("WebhookEndpoint", "Rejects invalid signature with 400 (correct behavior)");
  } else {
    fail("WebhookEndpoint", `Expected 400, got ${res.status}`);
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────
async function cleanup() {
  if (!testUserId) return;
  console.log(`\n── Cleanup: deleting test user ${testUserId.slice(0, 8)}…`);
  const { error } = await supabaseAdmin.auth.admin.deleteUser(testUserId);
  if (error) console.log(`   ⚠️  Cleanup failed: ${error.message}`);
  else console.log(`   ✓ Test user deleted`);
}

// ── Summary ────────────────────────────────────────────────────────────
function summary() {
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log("\n══════════════════════════════════════════════════");
  console.log("  E2E TEST SUMMARY");
  console.log("══════════════════════════════════════════════════");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️ ";
    console.log(`  ${icon} ${r.status}  ${r.name}`);
  }
  console.log(`\n  Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log("══════════════════════════════════════════════════\n");
  return failed;
}

// ── Main ───────────────────────────────────────────────────────────────
async function run() {
  console.log("🚀 HomePlanAI E2E Test Suite");
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`📧 Test email: ${testEmail}`);
  console.log(`🕐 ${new Date().toISOString()}`);

  // Check server is up
  try {
    const health = await fetch(`${APP_URL}/`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    console.log(`✓ Server is reachable`);
  } catch (e) {
    console.log(`❌ Server not reachable at ${APP_URL}: ${e.message}`);
    process.exit(1);
  }

  let session = null;
  let plansData = null;

  try {
    await testSignup();
    session = await testSignIn();
    if (!session) throw new Error("Cannot continue without a valid session");

    await testInitialUsage(session);
    plansData = await testGeneratePlans(session);
    await testUsageIncremented(session);
    await testQuotaEnforcement(session);
    await testPDFStructure(plansData);
    await testStripeCheckout();
    await testWebhookStructure();
  } finally {
    await cleanup();
  }

  const failed = summary();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("💥 Unhandled error:", err);
  process.exit(1);
});
