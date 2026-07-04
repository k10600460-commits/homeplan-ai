/**
 * Unit tests for the ContentOps compounding feedback loop pure logic + a real
 * end-to-end render proof: link_events (free portal signal) ALONE closes the
 * loop as status='partial' and produces feedback/<date>.md, with X/FB/blog
 * surfaced as declared gaps (env待ち/課金判断待ち) — never silent-zeroed.
 *
 * Run with: npx tsx src/lib/content-feedback.test.ts
 * (Same convention as reply-watch.test.ts — no network, no Supabase, no secrets.)
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregatePortal,
  decideStatus,
  pickWinnersLosers,
  portalEventWeight,
  portalWinnerCandidate,
  type LinkEventRow,
  type LinkMeta,
  type XItem,
} from "./content-feedback";

let passed = 0;
function ok(cond: boolean, msg: string) {
  assert.ok(cond, msg);
  passed++;
}

// ── 1. decideStatus: three-way (the core exit=66 fix) ────────────────────────
{
  ok(decideStatus(0, 0) === "complete", "no gaps → complete");
  ok(decideStatus(0, 2) === "partial", "X/FB unavailable, free core ok → partial (NOT failed)");
  ok(decideStatus(1, 0) === "failed", "free-core hard error → failed");
  ok(decideStatus(2, 3) === "failed", "hard error dominates unavailable → failed");
}

// ── 2. aggregatePortal: intent-weighted, per-slug, sorted ────────────────────
const rows: LinkEventRow[] = [
  { link_id: "L1", event_type: "view" },
  { link_id: "L1", event_type: "pdf_download" }, // weight 8
  { link_id: "L1", event_type: "plan_selected" }, // weight 5
  { link_id: "L2", event_type: "view" },
  { link_id: "L2", event_type: "view" },
];
const meta = new Map<string, LinkMeta>([
  ["L1", { slug: "alpha-123" }],
  ["L2", { slug: "beta-456" }],
]);
const agg = aggregatePortal(rows, meta);
{
  ok(agg.total_events === 5, "total_events counted");
  ok(agg.unique_links === 2, "unique_links counted");
  ok(agg.by_type.view === 3, "by_type view aggregated");
  ok(agg.by_type.pdf_download === 1, "by_type pdf_download aggregated");
  ok(agg.top_links[0].slug === "alpha-123", "top link resolves slug from meta");
  // PII guard: the portal agg must carry slug ONLY (never a buyer name), because
  // the content_feedback row is anon-readable and rendered into the public vault.
  ok(!("label" in agg.top_links[0]), "portal agg carries no PII label field (slug only)");
  ok(JSON.stringify(agg).indexOf("Acme") === -1, "no buyer-name field anywhere in portal agg");
  ok(agg.top_links[0].score === 1 + 8 + 5, "top link intent-weighted score (view+pdf+plan = 14)");
  ok(agg.top_links[1].slug === "beta-456" && agg.top_links[1].score === 2, "second link scored below");
  ok(agg.top_links[0].score > agg.top_links[1].score, "top_links sorted desc by score");

  // slug fallback when no meta (must not lose the free signal)
  const noMeta = aggregatePortal([{ link_id: "X9", event_type: "view" }]);
  ok(noMeta.top_links[0].slug === "X9", "falls back to link_id when slug lookup absent");
  ok(portalEventWeight("prequal_click") === 12, "prequal_click is the heaviest intent");
  ok(portalEventWeight("totally_unknown") === 1, "unknown event type defaults to weight 1");
}

// ── 3. portalWinnerCandidate: winner on distribution, null on empty day ──────
const portalWinner = portalWinnerCandidate(agg);
{
  ok(portalWinner !== null, "portal winner exists when there is engagement");
  ok(portalWinner!.channel === "portal" && portalWinner!.ref === "alpha-123", "winner names the resonant slug");
  ok(portalWinner!.score === 14 && /3 events/.test(portalWinner!.why ?? ""), "winner carries score + breakdown");
  ok(portalWinnerCandidate(aggregatePortal([])) === null, "empty portal day → no winner (no fabricated distribution)");
}

// ── 4. pickWinnersLosers: portal-only day still yields a usable winner ────────
{
  const { winners, losers, next_angle_ja } = pickWinnersLosers([], [], [], portalWinner);
  ok(winners.length === 1 && winners[0].channel === "portal", "portal-only → portal winner surfaced");
  ok(losers.length === 0, "no losers on a clean portal-only day");
  ok(/alpha-123/.test(next_angle_ja), "next_angle_ja names the winning portal slug");
  ok(/env未投入|欠測/.test(next_angle_ja), "next_angle_ja flags the X/FB gap (fail-loud, not silent)");
}

// ── 5. pickWinnersLosers: content winner + portal both surfaced ──────────────
{
  const x: XItem[] = [{
    draft_id: "d1", x_post_id: "t1", angle: "builder-workflow", text_head: "",
    status: "posted", last_error: null,
    metrics: { impressions: 100, likes: 2, replies: 1, reposts: 0, quotes: 0, bookmarks: 0 },
    score: 100 + 2 * 20 + 1 * 40, // 180
  }];
  const { winners } = pickWinnersLosers(x, [], [], portalWinner);
  ok(winners.length === 2, "content winner + portal winner both kept");
  ok(winners[0].channel === "x" && winners[0].angle === "builder-workflow", "content winner first");
  ok(winners.some(w => w.channel === "portal"), "portal winner retained as its own signal");
}

// ── 6. pickWinnersLosers: all-zero day makes no claim ────────────────────────
{
  const r = pickWinnersLosers([], [], [], null);
  ok(r.winners.length === 0, "no distribution → no winner (no over-optimization)");
  ok(/分布なし|ローテーション/.test(r.next_angle_ja), "all-zero day tells /contentops to hold rotation");
}

// ── 7. END-TO-END: link_events-only row → render writes feedback/<date>.md ────
{
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const renderScript = join(repoRoot, "scripts", "render-content-feedback.mjs");
  const work = mkdtempSync(join(tmpdir(), "content-feedback-"));
  const vault = join(work, "vault");
  const fixture = join(work, "row.json");
  const date = "2026-07-04";

  // Build the row EXACTLY as the server route would on an env-待ち day: only the
  // free link_events (portal) + builder are ok; X/FB/blog are declared gaps.
  const wl = pickWinnersLosers([], [], [], portalWinner);
  const row = {
    content_date: date,
    status: "partial",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_status: {
      x: { ok: false, unavailable: true, reason: "env未投入 X_API_BEARER_TOKEN（課金判断待ち・link_eventsで代替中）" },
      facebook: { ok: false, unavailable: true, reason: "env未投入 FB_PAGE_ACCESS_TOKEN（課金判断待ち）" },
      blog: { ok: false, unavailable: true, reason: "当日publish無し" },
      portal: { ok: true },
      builder: { ok: true },
    },
    x: null,
    facebook: null,
    blog: null,
    portal: agg,
    builder: { total_events: 0, by_type: {} },
    winners: wl.winners,
    losers: wl.losers,
    next_angle_ja: wl.next_angle_ja,
    error: null,
    public_ready: true,
  };
  writeFileSync(fixture, JSON.stringify(row));

  let exitCode = 0;
  try {
    execFileSync("node", [renderScript, "--date", date, "--vault", vault, "--fixture", fixture], {
      encoding: "utf8",
    });
  } catch (e) {
    exitCode = (e as { status?: number }).status ?? 1;
  }
  ok(exitCode === 0, "render exits 0 on a partial row (loop closed, no false-alarm)");

  const mdPath = join(vault, "SplanAI", "60_ContentOps", "feedback", `${date}.md`);
  ok(existsSync(mdPath), "feedback/<date>.md written from link_events-only row");
  const md = readFileSync(mdPath, "utf8");
  ok(/status: partial/.test(md), "md frontmatter status: partial");
  ok(/alpha-123/.test(md), "md names the resonant portal slug (link_events signal)");
  ok(/未取得ソース/.test(md) && /X_API_BEARER_TOKEN/.test(md), "md loudly lists the X/FB env gaps (fail-loud)");
  ok(/link_events/.test(md), "md documents link_events as the reaction main axis");

  rmSync(work, { recursive: true, force: true });
}

console.log(`content-feedback.test.ts: all ${passed} assertions passed`);
