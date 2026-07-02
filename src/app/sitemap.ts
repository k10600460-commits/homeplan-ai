import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://splanai.com";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/tools`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/tools/payment-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/tools/lot-feasibility`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
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
      }));
    }
  } catch (e) {
    console.error("[sitemap] seo_articles fetch failed:", e);
  }

  return [...staticRoutes, ...articleRoutes];
}
