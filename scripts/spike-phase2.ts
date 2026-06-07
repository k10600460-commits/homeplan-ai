#!/usr/bin/env npx tsx
/**
 * SplanAI Image Spike — Phase 2: go/no-go quality assessment
 *
 * Stage 1  gpt-image-1-mini / low  / 1536×1024  —  6 styles, cheap pass (~$0.03)
 * Stage 2  gpt-image-2        / medium / 1536×1024  —  top 2–3 styles (~$0.04–0.08)
 *
 * Usage:
 *   npx tsx scripts/spike-phase2.ts --stage 1 [--dry-run]
 *   npx tsx scripts/spike-phase2.ts --stage 2 --styles modern-farmhouse,craftsman,transitional [--dry-run]
 *
 * OPENAI_API_KEY is read from .env.local (never committed).
 * Output: /tmp/spike-out/{key}_{model}_{quality}.png
 *
 * Hard budget caps:
 *   Stage 1: max 6 images  (~$0.03)
 *   Stage 2: max 3 images  (~$0.12)
 *   Session total guard: $2.00
 */

import fs from "fs";
import path from "path";

// ── Output directory ──────────────────────────────────────────────────────────

const OUT_DIR = "/tmp/spike-out";

// ── Pricing (June 2026, 1536×1024 landscape) ─────────────────────────────────
// Landscape is ~1.5× square pixel count, so cost is ~1.5× the square price.
// Square prices: $0.02 low / $0.07 medium (gpt-image-1 family)
// gpt-image-2 medium: ~$0.07–$0.10 per 1536×1024
const COST: Record<string, number> = {
  "gpt-image-1-mini_low":    0.030,  // conservative estimate for 1536×1024
  "gpt-image-2_medium":      0.100,  // conservative estimate for 1536×1024
};

const BUDGET_CAP_USD = 2.00;

// ── 6 test styles ─────────────────────────────────────────────────────────────

interface Style {
  key: string;          // filename slug
  label: string;        // prompt {STYLE} token
  supplement: string;   // extra material/feature cues
  stories: number;
}

const STYLES: Style[] = [
  {
    key: "modern-farmhouse",
    label: "Modern Farmhouse",
    supplement: "board-and-batten white vertical siding, dark metal roof, black window frames, wrap-around covered porch",
    stories: 2,
  },
  {
    key: "craftsman",
    label: "Craftsman",
    supplement: "cedar shingle siding, stone base, tapered front columns, low-pitched gabled roof with wide overhanging eaves and exposed rafter tails",
    stories: 1,
  },
  {
    key: "transitional",
    label: "Transitional",
    supplement: "mixed stone and light-gray vinyl siding, clean lines, gabled entry bump-out, slim columns, covered front entry",
    stories: 2,
  },
  {
    key: "ranch",
    label: "Ranch",
    supplement: "single-story, long low profile, brick facade, wide shallow-pitched roof, attached two-car garage, manicured front lawn",
    stories: 1,
  },
  {
    key: "contemporary",
    label: "Contemporary Modern",
    supplement: "flat-roof sections, floor-to-ceiling windows, horizontal cedar accent panels, clean geometric massing, minimalist landscaping",
    stories: 2,
  },
  {
    key: "colonial",
    label: "Colonial",
    supplement: "red brick facade, symmetrical white column portico, double-hung multi-pane windows, dormers, two-car attached garage",
    stories: 2,
  },
];

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(s: Style): string {
  const storyLabel = s.stories === 1 ? "single-story" : `${s.stories}-story`;
  return (
    `Photorealistic exterior of a newly built ${storyLabel} single-family ${s.label} home on a ` +
    `suburban lot, front three-quarter view, daytime, clear sky, neat landscaping, ` +
    `no people, no text, no watermark, real-estate listing quality, centered, wide banner composition. ` +
    `Architectural details: ${s.supplement}.`
  );
}

// ── .env.local loader ─────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ── OpenAI image generation ───────────────────────────────────────────────────

async function generate(
  prompt: string,
  model: "gpt-image-1-mini" | "gpt-image-2",
  quality: "low" | "medium"
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — add to .env.local");

  const body = JSON.stringify({
    model,
    prompt,
    n: 1,
    size: "1536x1024",
    quality,
    output_format: "png",
  });

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`OpenAI ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> };
  const b64 = data.data[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no b64_json");
  return Buffer.from(b64, "base64");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const stageArg = parseInt(getArg("--stage") ?? "1", 10) as 1 | 2;
  const stylesArg = getArg("--styles");
  const dryRun = args.includes("--dry-run");

  // Resolve target styles
  let targets: Style[];
  if (stageArg === 1) {
    if (stylesArg) {
      // allow retrying specific styles in Stage 1
      const keys = stylesArg.split(",").map((k) => k.trim());
      targets = keys.map((k) => {
        const s = STYLES.find((s) => s.key === k);
        if (!s) { console.error(`Unknown style key: "${k}"`); process.exit(1); }
        return s!;
      });
    } else {
      targets = STYLES;                          // all 6
    }
  } else {
    if (!stylesArg) {
      console.error("Stage 2 requires --styles key1,key2,key3  (use keys from Stage 1 output)");
      console.error("Available keys:", STYLES.map((s) => s.key).join(", "));
      process.exit(1);
    }
    const keys = stylesArg.split(",").map((k) => k.trim());
    targets = keys.map((k) => {
      const s = STYLES.find((s) => s.key === k);
      if (!s) { console.error(`Unknown style key: "${k}"`); process.exit(1); }
      return s!;
    });
    if (targets.length > 3) {
      console.error("Stage 2 is capped at 3 styles to stay within $0.30 budget.");
      process.exit(1);
    }
  }

  // Stage config
  const model   = stageArg === 1 ? "gpt-image-1-mini" as const : "gpt-image-2" as const;
  const quality = stageArg === 1 ? "low"              as const : "medium"      as const;
  const costKey = `${model}_${quality}`;
  const costEach = COST[costKey] ?? 0.10;
  const totalEst = targets.length * costEach;

  console.log(`\n▶ SplanAI Image Spike — Phase 2`);
  console.log(`  Stage    : ${stageArg}`);
  console.log(`  Model    : ${model}`);
  console.log(`  Quality  : ${quality}`);
  console.log(`  Size     : 1536×1024`);
  console.log(`  Styles   : ${targets.map((s) => s.label).join(", ")}`);
  console.log(`  Est cost : ${targets.length} × $${costEach.toFixed(3)} = $${totalEst.toFixed(3)}`);
  console.log(`  Output   : ${OUT_DIR}/`);

  if (totalEst > BUDGET_CAP_USD) {
    console.error(`\n✗ Aborted: estimated cost $${totalEst.toFixed(2)} exceeds budget cap $${BUDGET_CAP_USD.toFixed(2)}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n── Prompts (dry run) ────────────────────────────────────────────");
    for (const s of targets) {
      console.log(`\n[${s.label}]\n${buildPrompt(s)}`);
    }
    console.log("\n✓ Dry run complete. Remove --dry-run to generate images.");
    return;
  }

  // Create output dir
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{
    key: string; label: string; file: string; ok: boolean;
    cost_usd: number; latency_ms: number; error?: string;
  }> = [];

  let runningCost = 0;

  for (let i = 0; i < targets.length; i++) {
    const s = targets[i];
    const filename = `${s.key}_${model}_${quality}.png`;
    const filepath = path.join(OUT_DIR, filename);
    const prompt = buildPrompt(s);

    process.stdout.write(`  [${i + 1}/${targets.length}] ${s.label}... `);
    const t0 = Date.now();

    try {
      const buf = await generate(prompt, model, quality);
      const ms = Date.now() - t0;
      fs.writeFileSync(filepath, buf);
      runningCost += costEach;
      console.log(`✓ ${ms}ms → ${filename} (running total: $${runningCost.toFixed(3)})`);
      results.push({ key: s.key, label: s.label, file: filepath, ok: true, cost_usd: costEach, latency_ms: ms });
    } catch (err) {
      const ms = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg}`);
      results.push({ key: s.key, label: s.label, file: filepath, ok: false, cost_usd: 0, latency_ms: ms, error: msg });
    }

    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n── Stage ${stageArg} complete ─────────────────────────────────────────`);
  console.log(`  OK: ${ok.length}  Failed: ${failed.length}`);
  console.log(`  Total cost: $${runningCost.toFixed(3)}`);
  console.log(`  Images: ${OUT_DIR}/`);

  if (stageArg === 1 && ok.length > 0) {
    console.log(`\n── Next step: Stage 2 ───────────────────────────────────────────`);
    console.log(`  Review images in ${OUT_DIR}/`);
    console.log(`  Pick 2–3 best styles, then run:`);
    console.log(`  npx tsx scripts/spike-phase2.ts --stage 2 --styles key1,key2,key3`);
    console.log(`  Available keys: ${ok.map((r) => r.key).join(", ")}`);
  }

  if (stageArg === 2 && ok.length > 0) {
    console.log(`\n── go/no-go assessment guide ────────────────────────────────────`);
    console.log(`  GO if ALL of the following:`);
    console.log(`    ✓ Photorealistic, listing-ready (buyer would believe it's real)`);
    console.log(`    ✓ No structural distortion (straight walls, correct perspective)`);
    console.log(`    ✓ Style vocabulary is correct (Craftsman ≠ Colonial ≠ Farmhouse)`);
    console.log(`    ✓ 3 production styles look like a coherent set`);
    console.log(`  NO-GO: note failure mode + "fixable in <0.5 day?" → if no, use illustrations`);
  }

  if (failed.length) {
    console.log(`\n  Failures:`);
    for (const r of failed) console.log(`    ${r.label}: ${r.error}`);
  }

  // Write machine-readable summary
  const summaryPath = path.join(OUT_DIR, `stage${stageArg}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ stage: stageArg, model, quality, results, total_cost_usd: runningCost }, null, 2));
  console.log(`  Summary: ${summaryPath}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
