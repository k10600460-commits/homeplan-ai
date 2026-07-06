import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkUsageLimit, recordApiUsage } from "@/lib/usage";
import { validateGenerateInput, ValidationError } from "@/lib/security";
import { checkRateLimitDB } from "@/lib/rate-limit-db";

// Claude generation takes ~30s in practice; pin the function ceiling so the
// route doesn't die on a plan-default timeout mid-generation (M2).
export const maxDuration = 60;

// 10 Claude generations per authenticated user per minute
const GENERATE_RATE = { limit: 10, windowSec: 60 };

const client = new Anthropic();

// Stable system prompt — cached via cache_control to save tokens on repeated calls
const SYSTEM_PROMPT = `You are an expert residential architect and home designer in the United States with 20 years of experience. You specialize in practical, beautiful floor plans that maximize space efficiency, natural light, and livability.

When generating floor plans:
- Consider standard setback requirements and lot coverage ratios (home footprint typically 20-40% of lot)
- Optimize traffic flow between rooms
- Ensure room proportions match family size
- Design within budget (typical construction: $150-$250 per sq ft)
- Separate primary bedroom from children's rooms for privacy
- Place kitchen near garage entry for convenience
- Include practical storage, mudrooms, and pantries where appropriate

When designing floor plans, follow contemporary American home design conventions:
- Favor open-concept layouts where the kitchen, dining, and main living area flow together; when the main living space opens to the kitchen, call it the "Great Room"
- Include a walk-in closet in the Primary Suite, and a walk-in pantry when square footage allows — name both explicitly
- Single-story plans should be described as "ranch" or "single-story." For lots in southern / Sun Belt states, prefer single-story ranch designs or primary-on-main two-story layouts
- Specify an attached garage with bay count (2-car or 3-car) and include a garage entry / mudroom drop zone in the flow
- Call the front entry a "foyer" and consider sight lines from the foyer into the Great Room
- Always use "Primary Bedroom / Primary Bath / Primary Suite," never "master"

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
      "garages": 2,
      "estimatedCost": 330000,
      "description": "2-3 sentence description of this plan's character and strengths.",
      "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
      "rooms": [
        { "name": "Primary Suite", "sqft": 320 },
        { "name": "Primary Bath", "sqft": 80 },
        { "name": "Walk-In Closet", "sqft": 60 },
        { "name": "Bedroom 2", "sqft": 140 },
        { "name": "Kitchen", "sqft": 180 },
        { "name": "Great Room", "sqft": 320 },
        { "name": "Foyer", "sqft": 80 },
        { "name": "Mudroom", "sqft": 60 },
        { "name": "Garage", "sqft": 440 }
      ],
      "highlights": ["Key selling point 1", "Key selling point 2", "Key selling point 3"]
    }
  ]
}

The "garages" field is an integer 0–3 representing the number of garage bays (e.g. 2 = 2-car garage). Match it to the budget and lot size.

Generate exactly 3 plans that are meaningfully different in style, layout, and architectural approach. All plans must fit within the given budget.`;

export async function POST(req: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    // ── Shared DB rate limit (10 req/min per user) ────────────
    const rl = await checkRateLimitDB(`generate:user:${user.id}`, GENERATE_RATE);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Usage limit check ─────────────────────────────────────
    const usageCheck = await checkUsageLimit(user.id);

    if (!usageCheck.allowed) {
      const upgradePath =
        usageCheck.plan === 'free' ? 'pro' :
        usageCheck.plan === 'pro'  ? 'team' :
        'custom';
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          code: "LIMIT_EXCEEDED",
          plan: usageCheck.plan,
          current: usageCheck.current,
          limit: usageCheck.limit,
          upgradePath,
        },
        { status: 429 },
      );
    }

    // ── Input validation + prompt injection prevention ────────
    const rawBody = await req.json();
    const { lotSize, budget, familySize } = validateGenerateInput(rawBody);

    // Optional MLS zoning — sanitize to plain alphanumeric/spaces/dashes, max 100 chars
    const rawZoning = typeof rawBody.mlsZoning === "string" ? rawBody.mlsZoning : "";
    const mlsZoning = rawZoning.replace(/[^a-zA-Z0-9 \-\/]/g, "").slice(0, 100).trim();

    const bedroomCount = Math.max(2, Math.ceil(familySize * 0.7));

    const zoningLine = mlsZoning ? `- Zoning: ${mlsZoning} (from MLS — ensure plans comply with this designation)\n` : "";

    // ── Claude generation ─────────────────────────────────────
    const genStart = Date.now();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192, // Sonnet 5: new tokenizer (~+30% tokens) — headroom to prevent 3-plan JSON truncation. max_tokens is a ceiling (billed per generated token only).
      thinking: { type: "disabled" }, // Sonnet 5 defaults adaptive thinking ON; keep OFF to preserve "~30s for 3 plans" latency and avoid thinking-token cost (matches prior 4.6 behavior).
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate 3 distinct residential floor plans for:
- Lot size: ${lotSize.toLocaleString()} sq ft
- Total budget: $${budget.toLocaleString()}
- Family size: ${familySize} person(s) — suggest approximately ${bedroomCount} bedrooms
${zoningLine}
Ensure all 3 plans are different architectural styles and each fits within the $${budget.toLocaleString()} budget.`,
        },
      ],
    });

    const genDurationMs = Date.now() - genStart;
    console.log('[generate:timing]', { durationMs: genDurationMs, userId: user.id });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in response");
    }

    const rawText = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const data = JSON.parse(rawText);

    if (!data.plans || !Array.isArray(data.plans) || data.plans.length !== 3) {
      throw new Error("Invalid response structure from AI");
    }

    // ── Record usage (non-blocking) ───────────────────────────
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    recordApiUsage(user.id, inputTokens, outputTokens).catch(console.error);

    // ── Record plan generation row (non-blocking) ─────────────
    const estimatedCostUsd = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
    (async () => {
      try {
        const { error } = await supabase.from('plan_generations').insert({
          user_id:            user.id,
          lot_size:           lotSize,
          budget,
          family_size:        familySize,
          plans:              data.plans,
          input_tokens:       inputTokens,
          output_tokens:      outputTokens,
          estimated_cost_usd: estimatedCostUsd,
        });
        if (error) console.error('[plan_generations] insert error:', error);
      } catch (e) {
        console.error('[plan_generations] insert failed:', e);
      }
    })();

    // ── First-plan follow-up email (non-blocking) ─────────────
    // usageCheck.current is the count BEFORE this request, so 0 means this
    // request generated the user's FIRST plan (M3: `=== 1` fired on the 2nd).
    if (usageCheck.current === 0 && user.email) {
      import("@/lib/emails").then(({ sendFirstPlanFollowupEmail }) => {
        sendFirstPlanFollowupEmail(user.email!).catch(console.error);
      });
    }

    return NextResponse.json({
      plans: data.plans,
      usage: {
        inputTokens,
        outputTokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        remaining: usageCheck.remaining - 1,
        limit: usageCheck.limit,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: "INVALID_INPUT" }, { status: error.status });
    }
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate floor plans. Please try again." },
      { status: 500 }
    );
  }
}
