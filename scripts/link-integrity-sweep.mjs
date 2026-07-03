#!/usr/bin/env node
/**
 * link-integrity-sweep.mjs — audit every ALREADY-POSTED social post for
 * splanai.com links that point at unpublished / nonexistent pages.
 *
 * Background (W1 2026-07-03): on 2026-07-02 an X auto-post linked
 * /blog/small-builder-look-like-a-national-one while the article was still
 * seo_articles.status='draft' — the post went out before the page existed.
 * This script sweeps the whole posted history so we know the blast radius,
 * and is kept for future re-audits.
 *
 * READ-ONLY by construction: issues ONLY Supabase REST GET requests.
 * Never writes to the database, never posts anywhere.
 *
 * What it does:
 *   1. Fetch x_post_draft  (status=posted, all rows: draft_text + link_url)
 *   2. Fetch fb_post_draft (status=posted, all rows: message)
 *   3. Fetch seo_articles  (slug + status) once
 *   4. Extract every splanai.com URL from the posted copy and classify:
 *        published_blog ✅  /blog/<slug> with seo_articles.status=published
 *        draft_blog     ⚠️  /blog/<slug> exists but NOT published (the bug)
 *        missing_blog   ❌  /blog/<slug> has no seo_articles row at all
 *        static_ok      ✅  postable public static route (see list below)
 *        pulse_metro    ✅  /pulse/<metro> present in src/data/pulse-metros.ts
 *        not_postable   ⚠️  real page but excluded from outbound copy (/login …)
 *        private_route  ⚠️  real route but robots.ts PRIVATE (/s/, /try, …)
 *        unknown        ❌  no such route
 *   5. Print a classification table + per-URL offending row ids.
 *
 * Route lists mirror src/app + src/app/robots.ts and the enforcement gate in
 * src/lib/content-quality.ts (checkLinkIntegrity). Keep the three in sync.
 *
 * Env (in order): process.env → <repo>/.env.local → main worktree /.env.local
 * (resolved via `git rev-parse --git-common-dir`, so this works from a git
 * worktree that has no local env file). Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (tables are RLS
 *   service-role-only; the key is used for GETs exclusively and never printed)
 *
 * Usage:  node scripts/link-integrity-sweep.mjs
 * Exit:   0 = sweep completed (findings, if any, are in the table)
 *         64 = env missing   65 = fetch/HTTP error
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── env loading (never printed) ──────────────────────────────────────────────
function loadEnvFile(path) {
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=("?)(.*)\2\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
  return true;
}

function loadEnv() {
  loadEnvFile(join(REPO, ".env.local"));
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  // Worktrees share the main repo's git dir; the main checkout holds .env.local.
  try {
    const commonDir = execFileSync(
      "git", ["-C", REPO, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8" },
    ).trim();
    loadEnvFile(join(dirname(commonDir), ".env.local"));
  } catch {
    // not a git repo — process.env / repo .env.local were the only sources
  }
}

loadEnv();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(64);
}

// ── READ-ONLY Supabase REST (GET only) ───────────────────────────────────────
async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    console.error(`❌ Supabase GET ${path.split("?")[0]} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(65);
  }
  return res.json();
}

// ── route knowledge (mirror of src/app + robots.ts + content-quality.ts) ─────
// STATIC_PUBLIC mirrors POSTABLE_STATIC_ROUTES in src/lib/content-quality.ts
// (hand-curated marketing routes — codex review). Real-but-not-postable pages
// are listed separately so the audit can tell "wrong link" from "no such page".
const STATIC_PUBLIC = new Set([
  "/", "/blog", "/pulse", "/tools", "/tools/payment-calculator",
  "/tools/lot-feasibility", "/terms", "/privacy",
]);
const NOT_POSTABLE_PAGES = new Set([
  "/generate", "/login", "/upgrade", "/forgot-password", "/reset-password",
]);
const PRIVATE_PREFIXES = ["/dashboard", "/results", "/s/", "/api/", "/invite", "/try"];

function pulseMetroSlugs() {
  try {
    const src = readFileSync(join(REPO, "src", "data", "pulse-metros.ts"), "utf8");
    return new Set([...src.matchAll(/slug:\s*"([^"]+)"/g)].map(m => m[1]));
  } catch {
    return new Set();
  }
}
const PULSE_METROS = pulseMetroSlugs();

// ── URL extraction (same normalization as checkLinkIntegrity) ────────────────
const URL_RE = /\bhttps?:\/\/[^\s<>"'()\][]+|(?<![\w/.@])(?:www\.)?splanai\.com\/[^\s<>"'()\][]*/gi;

function splanaiPaths(text) {
  const paths = new Set();
  for (const raw of (text ?? "").match(URL_RE) ?? []) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url;
    try { url = new URL(withProto); } catch { continue; }
    if (!/^(www\.)?splanai\.com$/i.test(url.hostname)) continue;
    let path = url.pathname.replace(/[.,!?;:…]+$/, "");
    if (path.length > 1) path = path.replace(/\/+$/, "");
    paths.add(path || "/");
  }
  return [...paths];
}

function classify(path, articleStatusBySlug) {
  if (STATIC_PUBLIC.has(path)) return { cls: "static_ok", mark: "✅", note: "public static route" };
  if (NOT_POSTABLE_PAGES.has(path)) return { cls: "not_postable", mark: "⚠️", note: "real page but not allowed in outbound copy" };
  const pulse = path.match(/^\/pulse\/([^/]+)$/);
  if (pulse) {
    return PULSE_METROS.has(pulse[1])
      ? { cls: "pulse_metro", mark: "✅", note: "pulse metro page" }
      : { cls: "unknown", mark: "❌", note: "no such pulse metro" };
  }
  const blog = path.match(/^\/blog\/([^/]+)$/);
  if (blog) {
    const status = articleStatusBySlug.get(blog[1]);
    if (status === "published") return { cls: "published_blog", mark: "✅", note: "seo_articles published" };
    if (status != null) return { cls: "draft_blog", mark: "⚠️", note: `seo_articles status=${status}` };
    return { cls: "missing_blog", mark: "❌", note: "no seo_articles row" };
  }
  if (PRIVATE_PREFIXES.some(p => path === p.replace(/\/$/, "") || path.startsWith(p)))
    return { cls: "private_route", mark: "⚠️", note: "robots.ts PRIVATE route" };
  return { cls: "unknown", mark: "❌", note: "no such route" };
}

// ── sweep ────────────────────────────────────────────────────────────────────
const [xPosted, fbPosted, articles] = await Promise.all([
  restGet("x_post_draft?status=eq.posted&select=id,run_date,platform,draft_text,link_url,posted_at&order=posted_at.asc&limit=10000"),
  restGet("fb_post_draft?status=eq.posted&select=id,run_date,message,posted_at&order=posted_at.asc&limit=10000"),
  restGet("seo_articles?select=slug,status&limit=10000"),
]);

const articleStatusBySlug = new Map(articles.map(a => [a.slug, a.status]));

// url → { classification, sources: Set<"x:<id>@<run_date>" | "fb:...">, xCount, fbCount }
const found = new Map();
function record(path, source, kind) {
  if (!found.has(path)) {
    found.set(path, { ...classify(path, articleStatusBySlug), x: 0, fb: 0, sources: [] });
  }
  const f = found.get(path);
  f[kind] += 1;
  f.sources.push(source);
}

let xRowsWithUrl = 0;
for (const row of xPosted) {
  const paths = splanaiPaths(`${row.draft_text ?? ""}\n${row.link_url ?? ""}`);
  if (paths.length > 0) xRowsWithUrl++;
  for (const p of paths) record(p, `x:${String(row.id).slice(0, 8)}@${row.run_date}`, "x");
}
let fbRowsWithUrl = 0;
for (const row of fbPosted) {
  const paths = splanaiPaths(row.message);
  if (paths.length > 0) fbRowsWithUrl++;
  for (const p of paths) record(p, `fb:${String(row.id).slice(0, 8)}@${row.run_date}`, "fb");
}

// ── report ───────────────────────────────────────────────────────────────────
const pubCount = articles.filter(a => a.status === "published").length;
console.log(`\n🔍 link-integrity sweep — ${new Date().toISOString()}`);
console.log(`scanned: x_post_draft posted=${xPosted.length} (with splanai URL: ${xRowsWithUrl}) | fb_post_draft posted=${fbPosted.length} (with splanai URL: ${fbRowsWithUrl}) | seo_articles=${articles.length} (published=${pubCount})\n`);

if (found.size === 0) {
  console.log("no splanai.com URLs found in posted copy.");
} else {
  const rows = [...found.entries()].sort((a, b) => a[1].cls.localeCompare(b[1].cls) || a[0].localeCompare(b[0]));
  const w = Math.max(...rows.map(([p]) => p.length), 4);
  console.log(`| ${"URL".padEnd(w)} | class          | x | fb | note`);
  console.log(`|-${"-".repeat(w)}-|----------------|---|----|-----`);
  for (const [path, f] of rows) {
    console.log(`| ${path.padEnd(w)} | ${f.mark} ${f.cls.padEnd(13)} | ${String(f.x)} | ${String(f.fb).padEnd(2)} | ${f.note}`);
  }
  const totals = {};
  for (const [, f] of rows) totals[f.cls] = (totals[f.cls] ?? 0) + 1;
  console.log(`\ntotals (distinct URLs): ${Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  const bad = rows.filter(([, f]) => f.mark !== "✅");
  if (bad.length > 0) {
    console.log(`\n⚠️ offending posted rows (fix = publish article / accept as historical):`);
    for (const [path, f] of bad) console.log(`  ${path} ← ${f.sources.slice(0, 10).join(", ")}${f.sources.length > 10 ? ` …+${f.sources.length - 10}` : ""}`);
  } else {
    console.log("\n✅ every posted splanai.com link resolves to a live public page.");
  }
}
console.log("");
