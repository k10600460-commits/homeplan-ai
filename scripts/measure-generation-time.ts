/**
 * Measures actual Claude API latency for 3-plan floor generation.
 * Uses the exact same model, prompt, and parameters as /api/generate/route.ts.
 * Run: npx tsx scripts/measure-generation-time.ts
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert residential architect and home designer in the United States with 20 years of experience. You specialize in practical, beautiful floor plans that maximize space efficiency, natural light, and livability.

When generating floor plans:
- Consider standard setback requirements and lot coverage ratios (home footprint typically 20-40% of lot)
- Optimize traffic flow between rooms
- Ensure room proportions match family size
- Design within budget (typical construction: $150-$250 per sq ft)
- Separate master bedroom from children's rooms for privacy
- Place kitchen near garage entry for convenience
- Include practical storage, mudrooms, and pantries where appropriate

Always respond with ONLY valid JSON — no explanation, no markdown, no extra text. Use exactly this structure:

{
  "plans": [
    {
      "id": 1,
      "name": "The [Distinctive Name]",
      "style": "Architectural style (e.g. Craftsman, Modern Farmhouse, Contemporary)",
      "squareFootage": 2200,
      "bedrooms": 3,
      "bathrooms": 2.5,
      "stories": 1,
      "estimatedCost": 330000,
      "description": "2-3 sentence description of this plan's character and strengths.",
      "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
      "rooms": [
        { "name": "Master Bedroom", "sqft": 240 },
        { "name": "Master Bath", "sqft": 80 },
        { "name": "Bedroom 2", "sqft": 140 },
        { "name": "Kitchen", "sqft": 180 },
        { "name": "Living Room", "sqft": 320 },
        { "name": "Dining Room", "sqft": 160 },
        { "name": "Garage", "sqft": 440 }
      ],
      "highlights": ["Key selling point 1", "Key selling point 2", "Key selling point 3"]
    }
  ]
}

Generate exactly 3 plans that are meaningfully different in style, layout, and architectural approach. All plans must fit within the given budget.`;

// Representative test inputs — varied lot, budget, family size, including Raleigh, NC address
const TEST_CASES = [
  { lotSize: 8500,  budget: 400000, familySize: 4, label: "Raleigh NC — avg lot, mid budget, family 4" },
  { lotSize: 12000, budget: 550000, familySize: 5, label: "Raleigh NC — large lot, upper budget, family 5" },
  { lotSize: 6000,  budget: 280000, familySize: 2, label: "Charlotte NC — small lot, low budget, couple" },
  { lotSize: 15000, budget: 750000, familySize: 6, label: "Dallas TX — xl lot, high budget, family 6" },
  { lotSize: 9000,  budget: 350000, familySize: 3, label: "Phoenix AZ — avg lot, mid budget, family 3" },
  { lotSize: 7500,  budget: 500000, familySize: 4, label: "Austin TX — small-mid lot, premium budget, family 4" },
  { lotSize: 20000, budget: 650000, familySize: 5, label: "Nashville TN — large lot, upper budget, family 5" },
  { lotSize: 5500,  budget: 250000, familySize: 2, label: "Columbus OH — small lot, budget entry, couple" },
  { lotSize: 10000, budget: 450000, familySize: 4, label: "Atlanta GA — avg lot, mid budget, family 4" },
  { lotSize: 18000, budget: 900000, familySize: 7, label: "Denver CO — xl lot, luxury budget, large family" },
];

interface RunResult {
  label: string;
  durationMs: number;
  outputTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  success: boolean;
  error?: string;
}

async function runOne(tc: typeof TEST_CASES[0], index: number): Promise<RunResult> {
  const bedroomCount = Math.max(2, Math.ceil(tc.familySize * 0.7));
  const userPrompt = `Generate 3 distinct residential floor plans for:
- Lot size: ${tc.lotSize.toLocaleString()} sq ft
- Total budget: $${tc.budget.toLocaleString()}
- Family size: ${tc.familySize} person(s) — suggest approximately ${bedroomCount} bedrooms

Ensure all 3 plans are different architectural styles and each fits within the $${tc.budget.toLocaleString()} budget.`;

  const start = Date.now();
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" } as any,
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text block");

    const raw = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(raw);
    if (!parsed.plans || parsed.plans.length !== 3) throw new Error("Expected 3 plans");

    process.stdout.write(`  [${index + 1}/10] OK  ${durationMs}ms  out:${response.usage.output_tokens}tok  cache_read:${response.usage.cache_read_input_tokens ?? 0}\n`);
    return {
      label: tc.label,
      durationMs,
      outputTokens: response.usage.output_tokens,
      inputTokens: response.usage.input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      success: true,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  [${index + 1}/10] ERR ${durationMs}ms  ${msg}\n`);
    return { label: tc.label, durationMs, outputTokens: 0, inputTokens: 0, cacheReadTokens: 0, success: false, error: msg };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

async function main() {
  console.log("=== SplanAI Generation Timing Benchmark ===");
  console.log(`Model: claude-sonnet-4-6  |  N=${TEST_CASES.length}  |  Started: ${new Date().toISOString()}\n`);
  console.log("Running generations sequentially (avoids API concurrency skew)...\n");

  const results: RunResult[] = [];
  for (let i = 0; i < TEST_CASES.length; i++) {
    const r = await runOne(TEST_CASES[i], i);
    results.push(r);
    // Small pause between calls to avoid burst rate limits
    if (i < TEST_CASES.length - 1) await new Promise(res => setTimeout(res, 500));
  }

  const successes = results.filter(r => r.success);
  const failures  = results.filter(r => !r.success);

  console.log("\n─────────────────────────────────────────────");
  console.log("INDIVIDUAL RESULTS");
  console.log("─────────────────────────────────────────────");
  results.forEach((r, i) => {
    const tag = r.success ? "OK " : "ERR";
    const sec = (r.durationMs / 1000).toFixed(1);
    console.log(`${i + 1}.  [${tag}] ${sec}s  —  ${r.label}`);
  });

  if (successes.length === 0) {
    console.log("\nNo successful runs — cannot compute statistics.");
    process.exit(1);
  }

  const times = successes.map(r => r.durationMs).sort((a, b) => a - b);
  const mean  = times.reduce((s, v) => s + v, 0) / times.length;
  const median = percentile(times, 50);
  const p75   = percentile(times, 75);
  const p95   = percentile(times, 95);
  const min   = times[0];
  const max   = times[times.length - 1];

  console.log("\n─────────────────────────────────────────────");
  console.log("STATISTICS  (successful runs only)");
  console.log("─────────────────────────────────────────────");
  console.log(`N (success / total): ${successes.length} / ${results.length}`);
  console.log(`Min:    ${(min  / 1000).toFixed(1)}s  (${min}ms)`);
  console.log(`Median: ${(median/ 1000).toFixed(1)}s  (${Math.round(median)}ms)`);
  console.log(`Mean:   ${(mean  / 1000).toFixed(1)}s  (${Math.round(mean)}ms)`);
  console.log(`P75:    ${(p75  / 1000).toFixed(1)}s  (${Math.round(p75)}ms)`);
  console.log(`P95:    ${(p95  / 1000).toFixed(1)}s  (${Math.round(p95)}ms)`);
  console.log(`Max:    ${(max  / 1000).toFixed(1)}s  (${max}ms)`);

  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    failures.forEach(r => console.log(`  - ${r.label}: ${r.error}`));
  }

  // Marketing-safe copy suggestion based on actual data
  const lo = Math.ceil(min / 1000);
  const hi = Math.ceil(p95 / 1000);
  const medSec = Math.ceil(median / 1000);

  console.log("\n─────────────────────────────────────────────");
  console.log("SUGGESTED MARKETING COPY  (data-backed)");
  console.log("─────────────────────────────────────────────");
  console.log(`Median: ~${medSec}s  |  Range (min–p95): ${lo}s–${hi}s`);
  console.log(`→ Conservative claim: "3 proposals in under ${hi} seconds"`);
  console.log(`→ Precise claim:      "typically ${lo}–${medSec} seconds"`);
  console.log(`→ Hero tagline option: "3 floor plans in about ${medSec} seconds"`);

  // Save raw results to docs/launch/
  const fs = await import("fs/promises");
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = `docs/launch/generation-timing-${dateStr}.md`;

  const md = [
    `# Generation Timing Benchmark — ${dateStr}`,
    "",
    `**Model:** claude-sonnet-4-6  |  **N:** ${results.length} (${successes.length} succeeded)  |  **Date:** ${new Date().toISOString()}`,
    "",
    "## Individual Results",
    "",
    "| # | Status | Time (s) | Output tokens | Cache read | Label |",
    "|---|--------|----------|---------------|------------|-------|",
    ...results.map((r, i) =>
      `| ${i + 1} | ${r.success ? "OK" : "ERR"} | ${(r.durationMs / 1000).toFixed(2)} | ${r.outputTokens} | ${r.cacheReadTokens} | ${r.label} |`
    ),
    "",
    "## Statistics",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Min    | ${(min / 1000).toFixed(2)}s |`,
    `| Median | ${(median / 1000).toFixed(2)}s |`,
    `| Mean   | ${(mean / 1000).toFixed(2)}s |`,
    `| P75    | ${(p75 / 1000).toFixed(2)}s |`,
    `| P95    | ${(p95 / 1000).toFixed(2)}s |`,
    `| Max    | ${(max / 1000).toFixed(2)}s |`,
    "",
    "## Suggested Marketing Copy",
    "",
    `- Conservative (covers p95): **"3 proposals in under ${hi} seconds"**`,
    `- Precise (min–median):       **"typically ${lo}–${medSec} seconds"**`,
    `- Hero tagline option:         **"3 floor plans in about ${medSec} seconds"**`,
    "",
    "## Notes",
    "",
    "- Times measured from `client.messages.create()` call start to response received (SDK round-trip including Anthropic API network latency).",
    "- System prompt uses `cache_control: ephemeral` — cache_read_tokens > 0 indicates prompt cache hit.",
    "- Run sequentially with 500ms gaps to avoid API burst interference.",
    "- Does NOT include Next.js HTTP overhead, auth checks, or DB calls (~50–200ms additional in production).",
  ].join("\n");

  await fs.writeFile(outPath, md, "utf-8");
  console.log(`\nResults written to: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
