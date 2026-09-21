import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import { hasSupabaseSessionCookie } from "@/lib/supabase/session-cookie";
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
        {
          // Sales-led volume plan — no public list price, so no price field here
          "@type": "Offer",
          name: "Custom",
          description: "Volume pricing for teams of 50+ — contact us",
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
  // Nav label only ("Sign in" vs "Dashboard"): decided here from cookie names so
  // the landing page ships no Supabase client and fires no auth request per view.
  // /dashboard authenticates for real. The page is already dynamic (headers()).
  const signedIn = hasSupabaseSessionCookie((await cookies()).getAll());
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJsonLd(origin)) }}
      />
      <HomePageClient signedIn={signedIn} />
    </>
  );
}
