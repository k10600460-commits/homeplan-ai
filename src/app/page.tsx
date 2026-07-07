import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import HomePageClient from "./HomePageClient";

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    alternates: {
      canonical: origin,
      languages: buildMarketLanguageAlternates("/"),
    },
  };
}

function buildJsonLd(origin: string) {
  return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: "SplanAI",
      url: origin,
      logo: `${origin}/logo.png`,
      sameAs: ["https://x.com/SplanAI"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${origin}/#software`,
      name: "SplanAI",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: origin,
      publisher: { "@id": `${origin}/#organization` },
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "49",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Team",
          price: "149",
          priceCurrency: "USD",
        },
      ],
    },
  ],
  };
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function Page() {
  const origin = requestOriginFromHeaders(await headers());
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJsonLd(origin)) }}
      />
      <HomePageClient />
    </>
  );
}
