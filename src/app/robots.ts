import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/results", "/s/", "/api/"] },
    sitemap: "https://splanai.com/sitemap.xml",
  };
}
