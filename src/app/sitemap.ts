import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { PULSE_METROS } from "@/data/pulse-metros";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = requestOriginFromHeaders(await headers());
  const withAlternates = (path: string) => ({
    languages: buildMarketLanguageAlternates(path),
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0, alternates: withAlternates("/") },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8, alternates: withAlternates("/blog") },
    { url: `${base}/pulse`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8, alternates: withAlternates("/pulse") },
    ...PULSE_METROS.map((m) => ({
      url: `${base}/pulse/${m.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      alternates: withAlternates(`/pulse/${m.slug}`),
    })),
    { url: `${base}/tools`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7, alternates: withAlternates("/tools") },
    { url: `${base}/tools/payment-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7, alternates: withAlternates("/tools/payment-calculator") },
    { url: `${base}/tools/lot-feasibility`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7, alternates: withAlternates("/tools/lot-feasibility") },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3, alternates: withAlternates("/terms") },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3, alternates: withAlternates("/privacy") },
  ];

  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await supabase
      .from("seo_articles")
      .select("slug, updated_at")
      .eq("status", "published");

    if (data) {
      articleRoutes = data.map((a) => ({
        url: `${base}/blog/${a.slug}`,
        lastModified: new Date(a.updated_at),
        changeFrequency: "monthly" as const,
        priority: 0.7,
        alternates: withAlternates(`/blog/${a.slug}`),
      }));
    }
  } catch (e) {
    console.error("[sitemap] seo_articles fetch failed:", e);
  }

  return [...staticRoutes, ...articleRoutes];
}
