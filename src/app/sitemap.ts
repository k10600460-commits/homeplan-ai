import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://splanai.com";
  return [
    { url: base,            lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
