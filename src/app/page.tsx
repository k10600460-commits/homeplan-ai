import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = {
  alternates: { canonical: "https://splanai.com" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://splanai.com/#organization",
      name: "SplanAI",
      url: "https://splanai.com",
      logo: "https://splanai.com/logo.png",
      sameAs: ["https://x.com/SplanAI"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://splanai.com/#software",
      name: "SplanAI",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://splanai.com",
      publisher: { "@id": "https://splanai.com/#organization" },
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

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <HomePageClient />
    </>
  );
}
