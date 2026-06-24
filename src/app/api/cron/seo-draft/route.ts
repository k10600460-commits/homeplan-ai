import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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
- NEVER use these words/phrases: "AI-powered", "game-changing", "revolutionary", "cutting-edge", "best-in-class", "seamless", "synergy", "disrupt", "leverage" (as a verb), "excited to announce", "in today's fast-paced".
- Do NOT call SplanAI a CRM. Do NOT claim specific customer counts, deals closed, ROI numbers, or that the plans are permit-ready — SplanAI produces buyer-ready CONCEPTS to start the conversation, not final/permit drawings.

Requirements:
- H1 title that naturally includes the target keyword
- Introduction: hook + problem statement (~150 words)
- 3-4 H2 sections covering the topic in depth with specific examples, numbers, and builder workflows
- Mention SplanAI 2-3 times naturally as a solution (not spammy)
- Conclusion with a clear CTA to try SplanAI free at splanai.com
- Plain Markdown only (no HTML tags)

Also write a meta description of 120-160 characters.

Today's date: ${todayISO}

Respond in this exact JSON format (raw JSON only, no code blocks, no extra text):
{"title":"...","description":"120-160 char meta description","content":"...full markdown..."}`;

  let result: { title: string; description: string; content: string };
  try {
    const msg = await anthropic.messages.create({
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
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  console.log(`[seo-draft] Draft created — keyword: "${keyword}" | slug: "${slug}" | chars: ${result.content.length}`);
  return NextResponse.json({ ok: true, keyword, slug, title: result.title, chars: result.content.length });
}
