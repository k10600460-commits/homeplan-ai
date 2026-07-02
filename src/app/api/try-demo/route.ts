import Anthropic from "@anthropic-ai/sdk";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateGenerateInput, ValidationError, getClientIp } from "@/lib/security";
import { hashIp, verifySignedPayload } from "@/lib/crypto";
import {
  checkAndClaimDemo,
  createSupabaseDemoStore,
  saveDemoResult,
  releaseDemoClaim,
} from "@/lib/demo-guard";

// Same ceiling as /api/generate — Claude call + DB roundtrips must fit.
export const maxDuration = 60;

const DEMO_COOKIE = "splanai_demo_id";
// Low-cost by design: haiku-class model ($1/$5 per MTok vs sonnet's $3/$15),
// ONE concept only, tight output cap. Worst case at the 50/day guard cap this
// stays under ~$0.25/day.
const DEMO_MODEL = "claude-haiku-4-5";
const DEMO_MAX_TOKENS = 1600;
const GENERATION_TIMEOUT_MS = 45_000;

// Budget is a fixed menu on /try — server enforces the same whitelist.
const ALLOWED_BUDGETS = new Set([250_000, 350_000, 500_000]);
const DEMO_FAMILY_SIZE = 3;

// Signed timestamp issued by the /try server component. Humans need at least
// a few seconds to fill the form; tokens expire after an hour.
const TOKEN_MIN_AGE_MS = 3_000;
const TOKEN_MAX_AGE_MS = 60 * 60 * 1000;

const client = new Anthropic();

const DEMO_SYSTEM_PROMPT = `You are an expert residential architect in the United States. Design ONE buyer-ready home concept for the given lot.

Follow contemporary American conventions: open-concept Great Room, Primary Suite with walk-in closet (never "master"), foyer entry, attached garage with bay count, mudroom drop zone. Keep the footprint to 20-40% of the lot and construction within budget (typical $150-$250/sq ft).

Respond with ONLY valid JSON — no explanation, no markdown. Exactly this structure:

{
  "plans": [
    {
      "id": 1,
      "name": "The [Distinctive Name]",
      "style": "Architectural style",
      "squareFootage": 2200,
      "bedrooms": 3,
      "bathrooms": 2.5,
      "stories": 1,
      "garages": 2,
      "estimatedCost": 330000,
      "description": "2-3 sentence description.",
      "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
      "rooms": [
        { "name": "Primary Suite", "sqft": 320 },
        { "name": "Kitchen", "sqft": 180 },
        { "name": "Great Room", "sqft": 320 }
      ],
      "highlights": ["Key selling point 1", "Key selling point 2", "Key selling point 3"]
    }
  ]
}

Generate exactly 1 plan. It must fit the budget.`;

function json(status: number, body: Record<string, unknown>, cookieId?: string) {
  const res = NextResponse.json(body, { status });
  if (cookieId) {
    res.cookies.set(DEMO_COOKIE, cookieId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

// Peppered HMAC (codex review): a plain SHA-256 of an IPv4 is dictionary-
// reversible; keying it with the server secret is not. Falls back to the
// existing hashIp only when no secret is configured (local dev).
function hashIpPeppered(ip: string): string {
  const pepper = process.env.AES_ENCRYPTION_KEY;
  if (pepper) return createHmac("sha256", pepper).update(ip).digest("hex");
  return hashIp(ip);
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // browsers always send Origin on fetch POST
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function verifyDemoToken(token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;

  // Local-dev fallback when AES_ENCRYPTION_KEY isn't configured. Never in prod.
  if (token.startsWith("dev-unsigned:")) {
    if (process.env.NODE_ENV === "production") return false;
    const iat = Number(token.slice("dev-unsigned:".length));
    const age = Date.now() - iat;
    return Number.isFinite(iat) && age >= TOKEN_MIN_AGE_MS && age <= TOKEN_MAX_AGE_MS;
  }

  const payload = verifySignedPayload(token);
  if (!payload || payload.purpose !== "try-demo") return false;
  const iat = Number(payload.iat);
  if (!Number.isFinite(iat)) return false;
  const age = Date.now() - iat;
  return age >= TOKEN_MIN_AGE_MS && age <= TOKEN_MAX_AGE_MS;
}

export async function POST(req: NextRequest) {
  const cookieId = req.cookies.get(DEMO_COOKIE)?.value ?? randomUUID();

  try {
    // ── Bot friction: same-origin + honeypot + signed timestamp ────────
    if (!isSameOrigin(req)) {
      return json(403, { error: "Request not allowed.", code: "FORBIDDEN" }, cookieId);
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return json(400, { error: "Invalid request.", code: "INVALID_INPUT" }, cookieId);
    }

    // Hidden field — humans leave it empty.
    if (typeof rawBody.website === "string" && rawBody.website.trim() !== "") {
      return json(403, { error: "Request not allowed.", code: "FORBIDDEN" }, cookieId);
    }

    if (!verifyDemoToken(rawBody.token)) {
      return json(403, { error: "This form expired — reload the page and try again.", code: "TOKEN_INVALID" }, cookieId);
    }

    // ── Identity: hashed IP + cookie (fail-closed if IP can't be read) ─
    const ip = getClientIp(req);
    if (!ip || ip === "unknown") {
      return json(403, { error: "Couldn't verify your request. Please sign up for the free plan instead.", code: "FORBIDDEN" }, cookieId);
    }
    const ipHash = hashIpPeppered(ip);

    // ── Input validation (reuses /api/generate bounds) ─────────────────
    const budget = Number(rawBody.budget);
    if (!ALLOWED_BUDGETS.has(budget)) {
      return json(400, { error: "Pick one of the sample budgets.", code: "INVALID_INPUT" }, cookieId);
    }
    const { lotSize } = validateGenerateInput({
      lotSize: rawBody.lotSize,
      budget,
      familySize: DEMO_FAMILY_SIZE,
    });
    const rawState = typeof rawBody.state === "string" ? rawBody.state.trim().toUpperCase() : "";
    const state = /^[A-Z]{2}$/.test(rawState) ? rawState : null;

    // ── Strict DB-backed guard: one demo per visitor, fail-closed ──────
    const guard = await checkAndClaimDemo(createSupabaseDemoStore(), ipHash, cookieId);

    if (!guard.ok) {
      if (guard.reason === "already_used") {
        if (guard.existingResult) {
          // Revisit: show the same sample again, no new Claude call.
          return json(200, { plan: guard.existingResult, reused: true }, cookieId);
        }
        return json(
          409,
          { error: "Looks like you've already tried the sample. The free plan gives you 3 real proposals a month.", code: "ALREADY_USED" },
          cookieId,
        );
      }
      if (guard.reason === "daily_cap") {
        return json(
          429,
          { error: "The sample generator is taking a breather today. The free plan is open, no card needed.", code: "DAILY_CAP" },
          cookieId,
        );
      }
      return json(
        503,
        { error: "The sample generator is offline right now. Try again in a bit, or just start free.", code: "DEMO_UNAVAILABLE" },
        cookieId,
      );
    }

    // ── Low-cost generation (1 concept, haiku, capped tokens) ──────────
    const locationLine = state ? `- Location: ${state} (typical suburban lot)\n` : "";
    try {
      const response = await Promise.race([
        client.messages.create({
          model: DEMO_MODEL,
          max_tokens: DEMO_MAX_TOKENS,
          system: DEMO_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Generate 1 residential home concept for:
- Lot size: ${lotSize.toLocaleString()} sq ft
- Total budget: $${budget.toLocaleString()}
- Family size: ${DEMO_FAMILY_SIZE} person(s)
${locationLine}`,
            },
          ],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DEMO_TIMEOUT")), GENERATION_TIMEOUT_MS),
        ),
      ]);

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text content in response");

      const rawText = textBlock.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const data = JSON.parse(rawText);
      const plan = Array.isArray(data.plans) ? data.plans[0] : null;
      if (!plan || typeof plan.name !== "string") throw new Error("Invalid demo plan structure");

      await saveDemoResult(guard.claimId, {
        result: plan,
        state,
        lotSize,
        budget,
        model: DEMO_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      console.log("[try-demo] generated", {
        claimId: guard.claimId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      return json(200, { plan, reused: false }, cookieId);
    } catch (genErr) {
      // Give the visitor their attempt back — the claim burned no Claude budget
      // worth keeping if we couldn't deliver a result.
      await releaseDemoClaim(guard.claimId);
      if (genErr instanceof Error && genErr.message === "DEMO_TIMEOUT") {
        return json(
          504,
          { error: "That took longer than it should. Nothing was used up — give it another go.", code: "TIMEOUT" },
          cookieId,
        );
      }
      throw genErr;
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return json(error.status, { error: error.message, code: "INVALID_INPUT" }, cookieId);
    }
    console.error("[try-demo] error:", error);
    return json(500, { error: "Something went wrong generating the sample. Try again in a minute.", code: "GENERATION_FAILED" }, cookieId);
  }
}
