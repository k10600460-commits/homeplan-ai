import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  BANNED_WORDS,
  suspectStat,
  validate as validateContentQuality,
} from "@/lib/content-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FbDraftResult = {
  message: string;
};

function getNewYorkDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function qualityIssuesForFacebook(text: string): string[] {
  const banned = validateContentQuality(
    "Facebook post",
    "Plain SplanAI Facebook Page post for home builders, checked only for banned terms.",
    text,
  ).filter(issue => issue.startsWith("banned"));

  return [...banned, ...suspectStat(text)];
}

async function hasDraftForDate(
  supabase: SupabaseClient,
  runDate: string,
): Promise<{ exists: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("fb_post_draft")
    .select("id, status")
    .eq("run_date", runDate)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: data != null, error: null };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const runDate = getNewYorkDate();
  const existing = await hasDraftForDate(supabase, runDate);

  if (existing.error) {
    console.error("[fb-draft] DB error:", existing.error);
    return NextResponse.json({ ok: false, error: existing.error }, { status: 500 });
  }

  if (existing.exists) {
    console.log(`[fb-draft] Draft already exists for ${runDate}`);
    return NextResponse.json({ ok: true, status: "already_exists", run_date: runDate });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You write Facebook Page posts for SplanAI (splanai.com) — a sales tool for small and mid-sized US home builders. From a lot address, SplanAI creates 3 buyer-ready home concepts with rough cost and financing feel and a shareable buyer page in about 30 seconds. It is a sales tool — not a CRM and not a CAD/design tool.

Write ONE Facebook Page post for today.

Audience: small home builders in the US, not homebuyers.
Tone: educational founder tone — practical, plain English, peer-to-peer, like a builder talking to another builder.

Voice rules (STRICT — follow exactly):
- Plain English. No marketing hype.
- Write as the solo founder in first person ("I"). Refer to the product in third person as "SplanAI" — never "we".
- 3 to 5 sentences.
- Facebook-appropriate: a little more developed than an X post, but still concise.
- ZERO hashtags.
- Gently pull the reader toward the blog or site without sounding pushy.
- NEVER use these words/phrases: ${BANNED_WORDS.map(w => `"${w}"`).join(", ")}, "seamless", "effortless", "unlock", "empower".
- Do NOT call SplanAI a CRM.
- Do NOT claim specific customer counts, deals closed, ROI numbers, or that plans are permit-ready.
- SplanAI produces buyer-ready concepts to start the conversation, not final/permit drawings.

Truthfulness rules (STRICT — a post that breaks any of these is auto-rejected before publishing):
- NEVER invent customer results, metrics, or adoption numbers. No "one builder went from X to Y", no "cut N hours to M", no "N% faster/more". SplanAI has NO citable customer results yet.
- NEVER claim a feature was "just shipped" / "just launched" / "now live". Do not announce launches at all — a human announces launches.
- NEVER cite a study, survey, or statistic unless it comes from a real named source, named in the post.
- No fake testimonials, no invented quotes, no implied traction.

Today's New York date: ${runDate}

Respond in this exact JSON format (raw JSON only, no code blocks, no extra text):
{"message":"..."}`;

  let result: FbDraftResult;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");
    result = JSON.parse(jsonMatch[0]) as FbDraftResult;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[fb-draft] Claude error:", errMsg);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }

  const message = result.message?.trim() ?? "";
  if (!message) {
    console.warn("[fb-draft] Draft rejected — empty message");
    return NextResponse.json({ ok: true, status: "empty_message", run_date: runDate });
  }

  const issues = qualityIssuesForFacebook(message);
  if (issues.length > 0) {
    console.warn(`[fb-draft] Draft rejected by quality gate — run_date: ${runDate} | issues: ${issues.join(", ")}`);
    return NextResponse.json({ ok: true, status: "quality_rejected", run_date: runDate, issues });
  }

  const { error: insertError } = await supabase.from("fb_post_draft").insert({
    run_date: runDate,
    message,
    status: "draft",
  });

  if (insertError) {
    console.error("[fb-draft] Insert error:", insertError.message);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  console.log(`[fb-draft] Draft created — run_date: ${runDate} | chars: ${message.length}`);
  return NextResponse.json({ ok: true, run_date: runDate, chars: message.length });
}
