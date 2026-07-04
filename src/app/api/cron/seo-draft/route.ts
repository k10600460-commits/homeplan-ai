import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  BANNED_WORDS,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  validate as validateContentQuality,
} from "@/lib/content-quality";
import { trackedMessage, recordError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEYWORD_POOL = [
  "home builder proposal",
  "custom home proposal template",
  "lot feasibility analysis",
  "custom home cost estimate",
  "pre-construction planning for builders",
  "how to win more custom home clients",
  "why home builders lose deals",
  "builder sales process",
  "home builder lead conversion",
  "cost per square foot custom home",
  "MLS data for home builders",
  "best software for custom home builders",
  "real estate development feasibility",
  "AI tools for home builders",
  // --- expanded 2026-06-30 for daily auto-publish (clean, builder-intent long-tail) ---
  "how to price a custom home build",
  "custom home builder marketing strategies",
  "how to get more custom home leads",
  "home builder website that converts",
  "builder follow up process for leads",
  "how to present floor plans to clients",
  "spec home vs custom home sales",
  "home builder referral strategy",
  "construction proposal software for builders",
  "how to qualify home building leads",
  "custom home buyer journey",
  "home builder branding tips",
  "new construction marketing ideas",
  "home builder lead nurturing",
  "how to handle home buyer objections",
  "selling custom home upgrades",
  "builder sales presentation tips",
  "home builder competitive advantage",
  "how to scale a custom home building business",
  "construction draw schedule explained",
  "home builder client communication",
  "builder land acquisition strategy",
  "custom home build timeline expectations",
  "home builder pricing transparency",
  "how builders compete with national builders",
  "semi custom home sales process",
  "how to use floor plans to sell homes",
  "home builder email follow up templates",
  "custom home financing options for buyers",
  "builder lead response time",
  "how to reduce custom home build delays",
  "home builder customer experience",
  "construction estimate accuracy for builders",
  "builder sales funnel",
  "how to get more home builder reviews",
  "new home community marketing",
  "how to sell a home before it is built",
  "builder discovery call questions",
  "home builder value proposition",
  "how to choose a custom home floor plan",
];

function toSlug(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing, error: dbError } = await supabase
    .from("seo_articles")
    .select("target_keyword, slug");

  if (dbError) {
    console.error("[seo-draft] DB error:", dbError.message);
    await recordError("cron/seo-draft", 500, dbError.message);
    return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
  }

  const usedKeywords = new Set(
    (existing ?? []).map((r: { target_keyword: string }) => r.target_keyword),
  );
  const usedSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug),
  );

  const keyword = KEYWORD_POOL.find(k => !usedKeywords.has(k));
  if (!keyword) {
    console.log("[seo-draft] All keywords exhausted — no draft generated");
    return NextResponse.json({ ok: true, status: "all_keywords_used" });
  }

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You are an SEO content writer for SplanAI (splanai.com) — a sales tool for small and mid-sized US home builders. From a lot address, SplanAI creates 3 buyer-ready home concepts (with a rough cost and financing feel and a shareable buyer page) in about 30 seconds. It is a sales tool — not a CRM and not a CAD/design tool.

Write a 1200-1500 word article targeting the keyword: "${keyword}"

Audience: small home builders in the US (not homebuyers).
Tone: expert, practical, peer-to-peer — like one builder talking to another.

Voice rules (STRICT — follow exactly):
- Plain English, like a builder talking to another builder. No marketing hype.
- NEVER use these words/phrases: ${BANNED_WORDS.map(w => `"${w}"`).join(", ")}.
- Do NOT call SplanAI a CRM. Do NOT claim specific customer counts, deals closed, ROI numbers, or that the plans are permit-ready — SplanAI produces buyer-ready CONCEPTS to start the conversation, not final/permit drawings.
- Do NOT invent statistics or cite studies. NEVER write percentages about buyer behaviour (e.g. "32% of buyers choose competitors"), "N% more likely", "$X in additional profit/revenue", or "a study / NAHB report found...". Drafts that contain invented numbers are auto-rejected.
- NEVER invent customer results ("one builder went from X to Y", "cut N hours to M", "N% faster"). SplanAI has NO citable customer results yet.
- NEVER claim a feature was "just shipped" / "just launched" / "now live". Do not announce launches.
- If you reference a market statistic, use ONLY one from this approved list, with its source in parentheses exactly as shown. Otherwise stay qualitative — describe the dynamic without inventing a number:
  - NAHB builder confidence (HMI) was 35 in June 2026, below the break-even 50 line (NAHB, June 2026)
  - ~62% of builders used sales incentives and ~35% cut prices (NAHB/NAR, June 2026)
  - US housing starts fell 15.4% month-over-month in May 2026 (U.S. Census Bureau)
  - regulatory costs make up ~26.4% of a new home's price (NAHB)
  - ~79% of US home-builder firms have fewer than 10 employees (NAHB)
  - new construction is ~17.5% custom vs ~73% spec in 2024 (U.S. Census / NAHB)
  - 30-year fixed mortgage ~6.47% (Freddie Mac, June 2026)
  - new single-family home sales fell ~6.2% month-over-month in April 2026, with ~9.4 months of supply (U.S. Census)
- Round, clearly hypothetical examples are fine (e.g. "say a buyer has a $350k budget").

Requirements:
- H1 title that naturally includes the target keyword
- Introduction: hook + problem statement (~150 words)
- 3-4 H2 sections covering the topic in depth with specific examples and real builder workflows
- Mention SplanAI 2-3 times naturally as a solution (not spammy)
- Conclusion with a clear CTA to try SplanAI free at splanai.com
- Plain Markdown only (no HTML tags)

Also write a meta description of ${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} characters.

Today's date: ${todayISO}

Respond in this exact JSON format (raw JSON only, no code blocks, no extra text):
{"title":"...","description":"${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} char meta description","content":"...full markdown..."}`;

  let result: { title: string; description: string; content: string };
  try {
    const msg = await trackedMessage("cron/seo-draft", anthropic, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");
    result = JSON.parse(jsonMatch[0]) as { title: string; description: string; content: string };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[seo-draft] Claude error:", errMsg);
    await recordError("cron/seo-draft", 500, errMsg, err instanceof Error ? err.stack : null);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }

  const issues = validateContentQuality(result.title, result.description, result.content);
  if (issues.length > 0) {
    console.warn(`[seo-draft] Draft rejected by quality gate — keyword: "${keyword}" | issues: ${issues.join(", ")}`);
    return NextResponse.json({ ok: true, status: "quality_rejected", keyword, issues });
  }

  // Ensure unique slug
  let slug = toSlug(keyword);
  let attempt = 0;
  while (usedSlugs.has(slug)) {
    slug = `${toSlug(keyword)}-${++attempt}`;
  }

  const { error: insertError } = await supabase.from("seo_articles").insert({
    slug,
    title: result.title,
    target_keyword: keyword,
    description: result.description,
    draft_content: result.content,
    status: "draft",
  });

  if (insertError) {
    console.error("[seo-draft] Insert error:", insertError.message);
    await recordError("cron/seo-draft", 500, insertError.message);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  console.log(`[seo-draft] Draft created — keyword: "${keyword}" | slug: "${slug}" | chars: ${result.content.length}`);
  return NextResponse.json({ ok: true, keyword, slug, title: result.title, chars: result.content.length });
}
