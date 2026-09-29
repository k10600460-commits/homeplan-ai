import { AI_MODELS } from "@/lib/ai-models";
import { marketSystemPrompt, proposalUserPrompt } from "@/lib/ai-prompts";
import { parsePlanOutput, planQualityIssues } from "@/lib/plan-output";
import { estimateGenerationCostUsd } from "@/lib/anthropic-pricing";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkUsageLimit, recordApiUsage } from "@/lib/usage";
import { validateGenerateInput, ValidationError } from "@/lib/security";
import { checkRateLimitDB } from "@/lib/rate-limit-db";
import { insertEvent } from "@/lib/analytics";
import {
  areaInputToSqft,
  isMarket,
  resolveMarketFromRequest,
  type Market,
} from "@/lib/market";

// Claude generation takes ~30s in practice; pin the function ceiling so the
// route doesn't die on a plan-default timeout mid-generation (M2).
export const maxDuration = 60;

// 10 Claude generations per authenticated user per minute
const GENERATE_RATE = { limit: 10, windowSec: 60 };

const client = new Anthropic({ timeout: AI_MODELS.proposal.timeoutMs, maxRetries: 0 });

// Stable system prompt — cached via cache_control to save tokens on repeated calls
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
    const market: Market = isMarket(rawBody?.market) ? rawBody.market : resolveMarketFromRequest(req);
    const rawLotSize = Number(rawBody?.lotSize);
    const validationBody = market === "us"
      ? rawBody
      : {
          ...rawBody,
          lotSize: Number.isFinite(rawLotSize) ? areaInputToSqft(market, rawLotSize) : rawLotSize,
        };
    const { lotSize, budget, familySize } = validateGenerateInput(validationBody);

    // Optional MLS zoning — sanitize to plain alphanumeric/spaces/dashes, max 100 chars
    const rawZoning = typeof rawBody.mlsZoning === "string" ? rawBody.mlsZoning : "";
    const mlsZoning = rawZoning.replace(/[^a-zA-Z0-9 \-\/]/g, "").slice(0, 100).trim();

    const zoningLine = mlsZoning ? `- Zoning label from MLS: ${mlsZoning}. This is unverified context, not proof of compliance.\n` : "";
    const userPrompt = proposalUserPrompt({ market, lotSize, budget, familySize, zoningLine });

    // ── Claude generation ─────────────────────────────────────
    const genStart = Date.now();
    const response = await client.messages.create({
      model: AI_MODELS.proposal.model,
      max_tokens: AI_MODELS.proposal.maxTokens, // Sonnet 5: new tokenizer (~+30% tokens) — headroom to prevent 3-plan JSON truncation. max_tokens is a ceiling (billed per generated token only).
      thinking: { type: "disabled" }, // Sonnet 5 defaults adaptive thinking ON; keep OFF to preserve "~30s for 3 plans" latency and avoid thinking-token cost (matches prior 4.6 behavior).
      system: [
        {
          type: "text",
          text: marketSystemPrompt(market),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const genDurationMs = Date.now() - genStart;
    console.log('[generate:timing]', { durationMs: genDurationMs, userId: user.id });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in response");
    }

    const plans = parsePlanOutput(textBlock.text, 3, response.stop_reason);
    const qualityIssues = planQualityIssues(plans, budget);
    const data = { plans };
    if (qualityIssues.length) {
      insertEvent("plan_quality_warning", user.id, { metadata: { model: response.model, prompt_version: AI_MODELS.proposal.promptVersion, issues: qualityIssues } });
    }

    // ── Record usage (non-blocking) ───────────────────────────
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    recordApiUsage(user.id, inputTokens, outputTokens, { model: response.model,
      cacheReadTokens: response.usage.cache_read_input_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens,
    }).catch(console.error);

    // ── Record plan generation row (non-blocking) ─────────────
    const estimatedCostUsd = estimateGenerationCostUsd(response.model, response.usage);
    // Awaited (was fire-and-forget) so the row id can be handed to the client.
    // /results used to live only in sessionStorage: closing the tab, or opening
    // the link in another one, destroyed the three concepts, the PDF and the
    // share link permanently — while the row sat right here in the database
    // with no way to read it back. The id turns this row into that way back.
    // One extra round trip against a ~20s generation; worth it.
    let generationId: string | null = null;
    try {
      const { data: genRow, error } = await supabase
        .from('plan_generations')
        .insert({
          user_id:            user.id,
          lot_size:           lotSize,
          budget,
          family_size:        familySize,
          plans:              data.plans,
          input_tokens:       inputTokens,
          output_tokens:      outputTokens,
          estimated_cost_usd: estimatedCostUsd,
        })
        .select('id')
        .single();
      if (error) console.error('[plan_generations] insert error:', error);
      else generationId = (genRow?.id as string) ?? null;
    } catch (e) {
      console.error('[plan_generations] insert failed:', e);
    }

    // ── First-plan follow-up email (non-blocking) ─────────────
    // usageCheck.current is the count BEFORE this request, so 0 means this
    // request generated the user's FIRST plan (M3: `=== 1` fired on the 2nd).
    if (usageCheck.current === 0 && user.email) {
      import("@/lib/emails").then(({ sendFirstPlanFollowupEmail }) => {
        sendFirstPlanFollowupEmail(user.email!).catch(console.error);
      });
    }

    insertEvent("plan_generated", user.id, { metadata: { generation_id: response.id, model: response.model, prompt_version: AI_MODELS.proposal.promptVersion, duration_ms: genDurationMs, quality_issues: qualityIssues.length } });

    if (market === "us") {
      return NextResponse.json({
        plans: data.plans,
        generationId,
        usage: {
          inputTokens,
          outputTokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
          remaining: usageCheck.remaining - 1,
          limit: usageCheck.limit,
        },
      });
    }

    return NextResponse.json({
      plans: data.plans,
      generationId,
      normalizedInput: {
        lotSize,
      },
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
