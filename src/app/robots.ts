import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "GPTBot",       disallow: ["/"] },
      { userAgent: "ChatGPT-User", disallow: ["/"] },
      { userAgent: "Claude-Web",   disallow: ["/"] },
      { userAgent: "anthropic-ai", disallow: ["/"] },
      { userAgent: "CCBot",        disallow: ["/"] },
      { userAgent: "Omgilibot",    disallow: ["/"] },
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/results", "/s/", "/api/", "/invite"] },
    ],
    sitemap: "https://splanai.com/sitemap.xml",
  };
}
