#!/usr/bin/env npx tsx
/**
 * Spike: AI image generation for SplanAI concept exterior photos
 *
 * Phase 1 — run without API key to see prompts + dry-run cost estimate.
 * Phase 2 — set API key in .env.local, run for real.
 *
 * Usage:
 *   npx tsx scripts/spike-image-gen.ts --api openai   [--quality low|medium] [--limit 7] [--dry-run]
 *   npx tsx scripts/spike-image-gen.ts --api replicate [--limit 7] [--dry-run]
 *
 * Required env vars (in .env.local or exported to shell):
 *   OPENAI_API_KEY     — for --api openai    (get at platform.openai.com/api-keys)
 *   REPLICATE_API_KEY  — for --api replicate (get at replicate.com/account/api-tokens)
 *
 * Output: ./spike-output/{api}_{style}_{index}.jpg
 *         ./spike-output/summary.json
 *
 * Hard cap: MAX_IMAGES=30 (prevents runaway spend).
 */

import fs from "fs";
import path from "path";
import https from "https";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_IMAGES = 30;
const OUTPUT_DIR = path.resolve("spike-output");

/** Cost per image in USD (June 2026 pricing) */
const COST_TABLE: Record<string, number> = {
  "openai-low":    0.005,   // gpt-image-1-mini, 1024×1024, low quality
  "openai-medium": 0.020,   // gpt-image-1-mini, 1024×1024, medium quality
  "replicate":     0.003,   // Flux.1 Schnell via Replicate
};

// ─── Test concepts ────────────────────────────────────────────────────────────

interface Concept {
  name: string;
  style: string;
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  stories: number;
  features: string[];
}

/** Test concepts: 1 real plan name + all 6 SplanAI style keys */
const TEST_CONCEPTS: Concept[] = [
  {
    name: "The Ridgewood Craftsman",
    style: "Craftsman",
    squareFootage: 2100,
    bedrooms: 3,
    bathrooms: 2,
    stories: 1,
    features: ["covered front porch", "craftsman columns", "stone and cedar accents", "low-pitched gabled roof"],
  },
  {
    name: "Farmhouse Test",
    style: "Modern Farmhouse",
    squareFootage: 2400,
    bedrooms: 4,
    bathrooms: 3,
    stories: 2,
    features: ["metal roof", "board-and-batten white siding", "wrap-around porch", "black window frames"],
  },
  {
    name: "Contemporary Test",
    style: "Contemporary Modern",
    squareFootage: 2800,
    bedrooms: 4,
    bathrooms: 3,
    stories: 2,
    features: ["flat roof", "floor-to-ceiling windows", "clean horizontal lines", "minimalist landscaping"],
  },
  {
    name: "Traditional Test",
    style: "Traditional Colonial",
    squareFootage: 2600,
    bedrooms: 4,
    bathrooms: 2.5,
    stories: 2,
    features: ["red brick facade", "symmetrical design", "white columns", "double attached garage"],
  },
  {
    name: "Transitional Test",
    style: "Transitional",
    squareFootage: 2200,
    bedrooms: 3,
    bathrooms: 2.5,
    stories: 2,
    features: ["stone and vinyl mixed materials", "neutral palette", "gabled roof", "covered entry"],
  },
  {
    name: "Hill Country Test",
    style: "Hill Country Traditional",
    squareFootage: 2300,
    bedrooms: 3,
    bathrooms: 2,
    stories: 1,
    features: ["standing seam metal roof", "limestone accents", "covered outdoor living patio", "exposed cedar beams"],
  },
  {
    name: "Prairie Test",
    style: "Prairie Modern",
    squareFootage: 3000,
    bedrooms: 5,
    bathrooms: 4,
    stories: 2,
    features: ["strong horizontal lines", "natural wood and stone", "wide overhanging eaves", "low-slope roof"],
  },
];

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildExteriorPrompt(c: Concept): string {
  const storyLabel = c.stories === 1 ? "single-story" : `${c.stories}-story`;
  const featList = c.features.join(", ");
  return [
    `Professional architectural exterior photograph of a ${storyLabel}`,
    `${c.squareFootage.toLocaleString()} sq ft ${c.style} style residential home.`,
    `Architectural features: ${featList}.`,
    `Setting: suburban US neighborhood, afternoon golden-hour light,`,
    `manicured front lawn, clear sky, mature trees flanking the house.`,
    `Camera: wide-angle street-level view, sharp focus, photorealistic.`,
    `No people, no cars in foreground, no text, no watermarks.`,
  ].join(" ");
}

// ─── .env.local loader ────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ─── OpenAI: gpt-image-1-mini ────────────────────────────────────────────────

async function generateOpenAI(
  prompt: string,
  quality: "low" | "medium"
): Promise<{ buffer: Buffer; costKey: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const body = JSON.stringify({
    model: "gpt-image-1-mini",
    prompt,
    n: 1,
    size: "1024x1024",
    quality,
    response_format: "b64_json",
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

  const data = (await res.json()) as { data: Array<{ b64_json: string }> };
  const b64 = data.data[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  return { buffer: Buffer.from(b64, "base64"), costKey: `openai-${quality}` };
}

// ─── Replicate: Flux.1 Schnell ────────────────────────────────────────────────

async function generateReplicate(
  prompt: string
): Promise<{ buffer: Buffer; costKey: string }> {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error("REPLICATE_API_KEY not set");

  // POST with Prefer: wait — Replicate returns result synchronously (up to 60s)
  const createRes = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: "4:3",
          output_format: "jpg",
          output_quality: 85,
          go_fast: true,
        },
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({ detail: createRes.statusText }));
    throw new Error(`Replicate ${createRes.status}: ${JSON.stringify(err)}`);
  }

  type Prediction = {
    id: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    output?: string[];
    error?: string;
    urls?: { get: string };
  };

  let prediction = (await createRes.json()) as Prediction;

  // Poll if not yet complete (fallback when Prefer: wait returns early)
  const startPoll = Date.now();
  while (
    prediction.status === "starting" ||
    prediction.status === "processing"
  ) {
    if (Date.now() - startPoll > 90_000) throw new Error("Replicate timeout after 90s");
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    prediction = (await pollRes.json()) as Prediction;
  }

  if (prediction.status !== "succeeded" || !prediction.output?.[0]) {
    throw new Error(`Replicate failed: ${prediction.error ?? "no output"}`);
  }

  const imageUrl = prediction.output[0];
  const buffer = await downloadBuffer(imageUrl);
  return { buffer, costKey: "replicate" };
}

// ─── Result recorder ──────────────────────────────────────────────────────────

interface ImageResult {
  index: number;
  name: string;
  style: string;
  prompt: string;
  ok: boolean;
  cost_usd: number;
  latency_ms: number;
  file?: string;
  error?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  // Parse CLI args
  const args = process.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  }

  const apiArg = getArg("--api") as "openai" | "replicate" | undefined;
  const limitArg = parseInt(getArg("--limit") ?? "7", 10);
  const qualityArg = (getArg("--quality") ?? "low") as "low" | "medium";
  const dryRun = args.includes("--dry-run");

  if (!apiArg || !["openai", "replicate"].includes(apiArg)) {
    console.error("Usage: npx tsx scripts/spike-image-gen.ts --api openai|replicate [--limit N] [--quality low|medium] [--dry-run]");
    process.exit(1);
  }

  const limit = Math.min(Math.max(1, limitArg || 7), MAX_IMAGES);
  const concepts = TEST_CONCEPTS.slice(0, limit);

  console.log(`\n▶ SplanAI Image Spike — API: ${apiArg} | Quality: ${apiArg === "openai" ? qualityArg : "n/a"} | Limit: ${limit} | Dry-run: ${dryRun}`);

  const costKey = apiArg === "openai" ? `openai-${qualityArg}` : "replicate";
  const costPerImage = COST_TABLE[costKey];
  console.log(`  Estimated cost: ${limit} × $${costPerImage.toFixed(4)} = $${(limit * costPerImage).toFixed(4)}`);

  if (dryRun) {
    console.log("\n── Prompts (dry run) ───────────────────────────────────────────");
    for (const c of concepts) {
      console.log(`\n[${c.style}]\n${buildExteriorPrompt(c)}`);
    }
    console.log("\n✓ Dry run complete. Run without --dry-run to generate images.");
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: ImageResult[] = [];

  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    const prompt = buildExteriorPrompt(c);
    const slug = c.style.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${apiArg}_${slug}_${i + 1}.jpg`;
    const filepath = path.join(OUTPUT_DIR, filename);

    process.stdout.write(`  [${i + 1}/${concepts.length}] ${c.name} (${c.style})... `);

    const t0 = Date.now();
    try {
      const { buffer } = apiArg === "openai"
        ? await generateOpenAI(prompt, qualityArg)
        : await generateReplicate(prompt);

      const latency_ms = Date.now() - t0;
      fs.writeFileSync(filepath, buffer);
      console.log(`✓ ${latency_ms}ms → ${filename}`);

      results.push({
        index: i + 1,
        name: c.name,
        style: c.style,
        prompt,
        ok: true,
        cost_usd: costPerImage,
        latency_ms,
        file: filename,
      });
    } catch (err) {
      const latency_ms = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${message}`);

      results.push({
        index: i + 1,
        name: c.name,
        style: c.style,
        prompt,
        ok: false,
        cost_usd: 0,
        latency_ms,
        error: message,
      });
    }

    // Small pause to avoid rate-limit bursts
    if (i < concepts.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const totalCost = succeeded.reduce((s, r) => s + r.cost_usd, 0);
  const avgLatency = succeeded.length
    ? Math.round(succeeded.reduce((s, r) => s + r.latency_ms, 0) / succeeded.length)
    : 0;
  const p50 = succeeded.length
    ? [...succeeded].sort((a, b) => a.latency_ms - b.latency_ms)[Math.floor(succeeded.length / 2)]?.latency_ms
    : 0;

  const summary = {
    api: apiArg,
    quality: apiArg === "openai" ? qualityArg : "n/a",
    cost_per_image_usd: costPerImage,
    total_images: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    total_cost_usd: parseFloat(totalCost.toFixed(5)),
    avg_latency_ms: avgLatency,
    p50_latency_ms: p50,
    results,
  };

  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n── Summary ──────────────────────────────────────────────────────`);
  console.log(`  OK: ${succeeded.length}  Failed: ${failed.length}`);
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
  console.log(`  Avg latency: ${avgLatency}ms  p50: ${p50}ms`);
  console.log(`  Images saved to: ${OUTPUT_DIR}/`);
  console.log(`  Full results:    ${summaryPath}`);
  if (failed.length) {
    console.log(`\n  Failures:`);
    for (const r of failed) console.log(`    ${r.style}: ${r.error}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
