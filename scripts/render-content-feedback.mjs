#!/usr/bin/env node
/**
 * render-content-feedback.mjs — ContentOps compounding feedback loop, LOCAL half.
 *
 * Reads the content_feedback row the Vercel cron (/api/cron/content-feedback)
 * upserted for the given ET date, using the PUBLIC anon key only (RLS allows
 * anon select where public_ready=true — no secrets on this machine), and
 * renders SplanAI/60_ContentOps/feedback/<date>.md in the Obsidian vault so
 * the next-day /contentops run can pick the winning angle.
 *
 * Design: obsidian-vault/SplanAI/60_ContentOps/feedback-loop-design-20260702.md
 * Invoked by: obsidian-vault/.claude/scripts/splanai-contentops-feedback.sh
 *             (launchd com.splanai.contentops-feedback, 07:40 JST)
 *
 * Usage:
 *   node scripts/render-content-feedback.mjs --date 2026-07-03 --vault /path/to/vault
 *   # local proof / pseudo-run without Supabase (reads a row JSON instead):
 *   node scripts/render-content-feedback.mjs --date 2026-07-04 --vault /path --fixture row.json
 *
 * Env (public values only; read from process.env or repo .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   (not required when --fixture is given)
 *
 * FAIL-LOUD (never silent-zero):
 *   exit 0  = rendered a status:complete OR status:partial row. Partial =
 *             the free link_events signal closed the loop; X/FB/blog were
 *             unavailable (env待ち/課金判断待ち) and are listed as declared gaps.
 *   exit 2  = rendered a row but its status is 'failed' (md written, loud)
 *   exit 65 = no row for the date (server cron did not run/write) — a
 *             status:failed md IS still written so /contentops sees the gap
 *   exit 64 = env/fetch/write error (md may not exist)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ── args ─────────────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DATE = arg("date");
const VAULT = arg("vault");
const FIXTURE = arg("fixture"); // local pseudo-run: read row JSON instead of Supabase

if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE) || !VAULT) {
  console.error("usage: node scripts/render-content-feedback.mjs --date YYYY-MM-DD --vault /path/to/vault [--fixture row.json]");
  process.exit(64);
}

// ── env (public anon only; optionally from .env.local next to this repo) ─────
function loadDotEnvLocal() {
  const p = join(dirname(new URL(import.meta.url).pathname), "..", ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=("?)(.*)\2\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const OUT_DIR = join(VAULT, "SplanAI", "60_ContentOps", "feedback");
const OUT_PATH = join(OUT_DIR, `${DATE}.md`);

// ── helpers ──────────────────────────────────────────────────────────────────
const fence = (obj) => "```json\n" + JSON.stringify(obj ?? null, null, 2) + "\n```";
const nowIso = () => new Date().toISOString();

function writeMd(status, body) {
  mkdirSync(OUT_DIR, { recursive: true });
  const md = `---
tags: [splanai, contentops, feedback]
content_date: ${DATE}
status: ${status}
rendered_at: ${nowIso()}
source: content_feedback (Supabase, anon public read)
---

# ContentOps Feedback — ${DATE} (ET)

${body}
`;
  writeFileSync(OUT_PATH, md);
  console.log(`📝 wrote ${OUT_PATH} (status: ${status})`);
}

function candidateLine(c) {
  const tail = c.failed ? `FAILED — ${c.why ?? "post failed"}` : `score ${c.score}${c.why ? ` — ${c.why}` : ""}`;
  return `- **${c.channel}** / angle \`${c.angle}\` (${c.ref}): ${tail}`;
}

// Human-readable portal (link_events) block — WHICH shared portal resonated.
function portalSection(portal) {
  if (!portal || typeof portal !== "object") return "- portal データなし";
  const lines = [
    `- 合計 ${portal.total_events ?? 0} events / ユニークポータル ${portal.unique_links ?? 0}`,
  ];
  const byType = portal.by_type ?? {};
  const bt = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}×${n}`)
    .join(", ");
  if (bt) lines.push(`- 内訳: ${bt}`);
  const top = Array.isArray(portal.top_links) ? portal.top_links : [];
  if (top.length > 0) {
    lines.push("- 反応上位ポータル:");
    for (const l of top.slice(0, 5)) {
      const b = Object.entries(l.by_type ?? {})
        .sort((a, b2) => b2[1] - a[1])
        .map(([t, n]) => `${t}×${n}`)
        .join(", ");
      // slug only — never a buyer name (PII must not reach the public vault).
      lines.push(`  - \`${l.slug}\`: score ${l.score} / ${l.events} events${b ? ` — ${b}` : ""}`);
    }
  }
  return lines.join("\n");
}

// Declared gaps (env待ち/課金判断待ち) from source_status — fail-loud, visible.
function unavailableSection(sourceStatus) {
  if (!sourceStatus || typeof sourceStatus !== "object") return null;
  const gaps = Object.entries(sourceStatus)
    .filter(([, s]) => s && s.unavailable)
    .map(([name, s]) => `- **${name}**: ${s.reason ?? "unavailable"}`);
  return gaps.length ? gaps.join("\n") : null;
}

function renderRow(row) {
  const status = row.status ?? "complete";
  const failed = status === "failed";
  const partial = status === "partial";

  const sections = [];

  if (failed) {
    sections.push(
      "> ⚠️ **集計 FAILED（fail-loud）** — 無料コアソース（link_events/builder）が壊れた。欠損データで黙って最適化しない。",
      `> error: ${row.error ?? "(no message)"}`,
      "",
    );
  } else if (partial) {
    sections.push(
      "> ℹ️ **partial（複利は閉じている）** — 反応回収の主軸 **link_events（無料・自社一次データ）** で当日を集計済み。",
      "> X/FB/blog は下記「未取得ソース」の理由で欠測（env待ち/課金判断待ち）。**欠測を0扱いせず、明日の最適化は link_events の勝ち系統ベースで進める。**",
      "",
    );
  }

  sections.push("## 翌日の /contentops への指示", "", `**${row.next_angle_ja ?? "(none)"}**`, "");

  const gaps = unavailableSection(row.source_status);
  if (gaps) {
    sections.push("## 未取得ソース（declared gaps・fail-loud）", "", gaps, "");
  }

  const winners = Array.isArray(row.winners) ? row.winners : [];
  const losers = Array.isArray(row.losers) ? row.losers : [];
  sections.push("## Winners / Losers", "");
  sections.push(winners.length ? winners.map(candidateLine).join("\n") : "- winner なし（分布なし）");
  sections.push(losers.length ? losers.map(candidateLine).join("\n") : "- loser なし");
  sections.push("");

  sections.push("## Portal (link_events) — 反応の主軸", "", portalSection(row.portal), "");
  sections.push("## ソース状態", "", fence(row.source_status), "");
  sections.push("## X", "", fence(row.x), "");
  sections.push("## Facebook", "", fence(row.facebook), "");
  sections.push("## Blog", "", fence(row.blog), "");
  sections.push("## Builder (builder_events)", "", fence(row.builder), "");
  sections.push(`> generated_at (server): ${row.generated_at ?? "?"} / schema_version: ${row.schema_version ?? "?"}`);

  writeMd(status, sections.join("\n"));

  if (failed) {
    console.error("⚠️ server row status=failed — md written, exiting non-zero (fail-loud)");
    process.exit(2);
  }
  if (partial) {
    console.log("✅ feedback rendered (partial — link_events で複利ループを閉じた)");
    process.exit(0);
  }
  console.log("✅ feedback rendered (complete)");
}

// ── row source: Supabase (anon) or --fixture (local proof) ─────────────────────
async function loadRow() {
  if (FIXTURE) {
    if (!existsSync(FIXTURE)) {
      console.error(`❌ fixture not found: ${FIXTURE}`);
      process.exit(64);
    }
    const parsed = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows;
  }

  loadDotEnvLocal();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("❌ missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (public values; set env or .env.local)");
    process.exit(64);
  }
  const url =
    `${SUPABASE_URL}/rest/v1/content_feedback` +
    `?content_date=eq.${DATE}&select=*&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) {
    console.error(`❌ Supabase read failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(64);
  }
  return res.json();
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const rows = await loadRow();

  if (!Array.isArray(rows) || rows.length === 0) {
    // FAIL-LOUD: leave a failed md so tomorrow's /contentops sees the gap
    // instead of silently optimizing on nothing.
    writeMd(
      "failed",
      [
        "> ⚠️ **feedback 未生成（サーバー行なし）**",
        "> `/api/cron/content-feedback` がこの日付の `content_feedback` 行を書いていない",
        "> （cron未実行・デプロイ前・または route が upsert 前に落ちた）。",
        "> **このデータで角度最適化しないこと。**",
        "",
        "## 翌日の /contentops への指示",
        "- 勝ち角度データなし。pillar ローテーションを維持し、角度は変えない。",
        "- 配信インフラの確認が先: Vercel cron 実行ログ / content_feedback テーブル。",
      ].join("\n"),
    );
    process.exit(65);
  }

  renderRow(rows[0]);
}

main().catch((e) => {
  console.error("❌ render failed:", e?.message ?? e);
  process.exit(64);
});
