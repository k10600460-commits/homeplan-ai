#!/usr/bin/env npx tsx
/**
 * scripts/gen-demo-images.ts
 *
 * Generates 6 demo exterior images (gpt-image-2 / medium / 1536×1024),
 * crops to 2.87:1 banner (1536×535), uploads to Supabase Storage plan-images bucket,
 * and prints the public URL mapping for use in demo portals.
 *
 * Usage:
 *   npx tsx scripts/gen-demo-images.ts [--dry-run]
 *
 * Keys read from .env.local (never committed):
 *   OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Cost: 6 × ~$0.10 = ~$0.60
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

const OUT_DIR = "/tmp/demo-images";
const BUCKET = "plan-images";
const FOLDER = "demo";

const STYLES = [
  { key: "modern_farmhouse", label: "Modern Farmhouse" },
  { key: "craftsman",        label: "Craftsman" },
  { key: "transitional",     label: "Transitional" },
  { key: "contemporary",     label: "Contemporary Modern" },
  { key: "ranch",            label: "Ranch Style" },
  { key: "colonial",         label: "Colonial" },
];

function buildPrompt(label: string): string {
  return (
    `Photorealistic exterior of a newly built single-family ${label} home on a ` +
    `suburban lot, front three-quarter view, daytime, clear sky, neat landscaping, ` +
    `no people, no text, real-estate listing quality, centered, wide composition.`
  );
}

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

async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set in .env.local");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1536x1024",
      quality: "medium",
      output_format: "png",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`OpenAI ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = (await res.json()) as { data: Array<{ b64_json?: string }> };
  const b64 = data.data[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no b64_json");
  return Buffer.from(b64, "base64");
}

async function main() {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const stylesArg = process.argv[process.argv.indexOf("--styles") + 1] as string | undefined;
  const filterKeys = stylesArg ? stylesArg.split(",").map((k) => k.trim()) : null;
  const activeStyles = filterKeys ? STYLES.filter((s) => filterKeys.includes(s.key)) : STYLES;

  if (filterKeys && activeStyles.length !== filterKeys.length) {
    const bad = filterKeys.filter((k) => !STYLES.find((s) => s.key === k));
    console.error(`Unknown style keys: ${bad.join(", ")}`);
    console.error(`Valid keys: ${STYLES.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log(`\n▶ SplanAI Demo Image Generator`);
  console.log(`  Model   : gpt-image-2 / medium / 1536×1024`);
  console.log(`  Crop    : 1536×535 (2.87:1 banner)`);
  console.log(`  Bucket  : ${BUCKET}/${FOLDER}/`);
  console.log(`  Styles  : ${activeStyles.map((s) => s.label).join(", ")}`);
  console.log(`  Est cost: ${activeStyles.length} × $0.10 = $${(activeStyles.length * 0.10).toFixed(2)}`);
  if (dryRun) {
    console.log("\n── Prompts (dry run) ────────────────────────────────────────");
    for (const s of activeStyles) console.log(`\n[${s.label}]\n${buildPrompt(s.label)}`);
    console.log("\n✓ Dry run complete. Remove --dry-run to generate.");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const urlMap: Record<string, string> = {};
  let totalCost = 0;

  for (let i = 0; i < activeStyles.length; i++) {
    const { key, label } = activeStyles[i];
    const rawPath    = path.join(OUT_DIR, `${key}_raw.png`);
    const croppedPath = path.join(OUT_DIR, `${key}.png`);
    const storagePath = `${FOLDER}/${key}.png`;

    // ── Generate ──────────────────────────────────────────────────────────────
    process.stdout.write(`[${i + 1}/${activeStyles.length}] ${label} — generating... `);
    const t0 = Date.now();
    const buf = await generateImage(buildPrompt(label));
    fs.writeFileSync(rawPath, buf);
    const genMs = Date.now() - t0;
    console.log(`✓ ${genMs}ms`);
    totalCost += 0.10;

    // ── Crop to 1536×535 (center crop, 2.87:1) ────────────────────────────────
    process.stdout.write(`       ${label} — cropping to 1536×535... `);
    execSync(`sips -c 535 1536 "${rawPath}" --out "${croppedPath}"`, { stdio: "pipe" });
    console.log("✓");

    // ── Upload ────────────────────────────────────────────────────────────────
    process.stdout.write(`       ${label} — uploading... `);
    const fileData = fs.readFileSync(croppedPath);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileData, { contentType: "image/png", upsert: true });
    if (uploadErr) throw new Error(`Upload ${key}: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    urlMap[key] = publicUrl;
    console.log(`✓`);

    if (i < activeStyles.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n── Done — total cost: ~$${totalCost.toFixed(2)} ────────────────────────────────`);
  console.log("\n── URL mapping (paste into portal) ──────────────────────────────");
  console.log(JSON.stringify(urlMap, null, 2));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
