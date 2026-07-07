import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { requestOriginFromHeaders } from "@/lib/request-url";

// GEO (Generative Engine Optimization) policy — 2026-07-02
// AI crawlers are ALLOWED on public marketing/blog pages so SplanAI can be
// cited/mentioned in AI search answers (brand mentions > backlinks — see
// vault: wiki/atoms/ai-search-brand-over-backlinks / ppp-014).
// Private/user areas stay blocked for every crawler.
// Trade-off accepted: content becomes available for AI training corpora in
// exchange for AI-search visibility. Revisit if leakage of gated content
// is ever observed. Pairs with public/llms.txt.
const PRIVATE_PATHS = ["/dashboard", "/results", "/s/", "/api/", "/invite", "/try"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    rules: [
      { userAgent: "GPTBot",         allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ChatGPT-User",   allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "OAI-SearchBot",  allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Claude-Web",     allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ClaudeBot",      allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "anthropic-ai",   allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "PerplexityBot",  allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "CCBot",          allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Omgilibot",      allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
