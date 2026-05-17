import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkUsageLimit, recordApiUsage } from "@/lib/usage";
import {
  checkRateLimit,
  validateGenerateInput,
  ValidationError,
  getClientIp,
} from "@/lib/security";

const client = new Anthropic();

// Stable system prompt — cached via cache_control to save tokens on repeated calls
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

export async function POST(req: NextRequest) {
  try {
    // ── IP-based rate limit (5 req/min) ───────────────────────
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // ── Auth check ────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    // ── Usage limit check ─────────────────────────────────────
    const usageCheck = await checkUsageLimit(user.id);

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          code: "LIMIT_EXCEEDED",
          plan: usageCheck.plan,
          current: usageCheck.current,
          limit: usageCheck.limit,
        },
        { status: 429 },
      );
    }

    // ── Input validation + prompt injection prevention ────────
    const rawBody = await req.json();
    const { lotSize, budget, familySize } = validateGenerateInput(rawBody);

    const bedroomCount = Math.max(2, Math.ceil(familySize * 0.7));

    // ── Claude generation ─────────────────────────────────────
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
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

Ensure all 3 plans are different architectural styles and each fits within the $${budget.toLocaleString()} budget.`,
        },
      ],
    });

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
