import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PULSE_METROS } from "@/data/pulse-metros";
import { buildPulseGeoPassage, fmtMonth, getLatestPulseSnapshot } from "@/lib/pulse";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import { PulseSubscribeForm } from "@/components/PulseSubscribeForm";
import { PulseViewPing } from "@/components/PulseViewPing";
import {
  PartialSnapshotNote,
  PaymentTable,
  PulseFooter,
  PulseHeader,
  serializeJsonLd,
  UpdatingNote,
} from "./pulse-ui";

// Regenerate hourly so the weekly cron's snapshot shows up without a deploy.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    title: "Builder Market Pulse — weekly rates & single-family permits | SplanAI",
    description:
      "Free weekly data hub for small US home builders: the Freddie Mac PMMS 30-year fixed rate turned into monthly-payment tables ($300k–$800k), plus U.S. Census Bureau single-family permit counts for ten builder-heavy metros.",
    alternates: { canonical: `${origin}/pulse`, languages: buildMarketLanguageAlternates("/pulse") },
  };
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Dataset",
      "@id": "https://splanai.com/pulse#dataset",
      name: "SplanAI Builder Market Pulse",
      description:
        "Weekly snapshot of the Freddie Mac PMMS 30-year fixed mortgage rate (FRED series MORTGAGE30US) and U.S. Census Bureau Building Permits Survey single-family (1-unit) permit counts for ten US metros, with monthly principal-and-interest tables for homes priced $300,000 to $800,000 at 20% down.",
      url: "https://splanai.com/pulse",
      creator: {
        "@type": "Organization",
        name: "SplanAI",
        url: "https://splanai.com",
      },
      isBasedOn: [
        "https://fred.stlouisfed.org/series/MORTGAGE30US",
        ...PULSE_METROS.map((m) => m.fredSeriesUrl),
      ],
      keywords: [
        "mortgage rates",
        "building permits",
        "home builders",
        "single-family construction",
        ...PULSE_METROS.map((m) => `${m.name} housing market`),
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://splanai.com/pulse#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "Where does the mortgage rate on this page come from?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "From Freddie Mac's Primary Mortgage Market Survey (30-year fixed average), published through FRED as series MORTGAGE30US. The page states the observation date next to the rate and refreshes weekly.",
          },
        },
        {
          "@type": "Question",
          name: "Where does the building-permit data come from?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "From the U.S. Census Bureau Building Permits Survey, published through FRED. Each metro uses its single-family (1-unit structures) series, monthly and not seasonally adjusted, and the series ID is named on the page.",
          },
        },
        {
          "@type": "Question",
          name: "How are the monthly payments calculated?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Principal and interest on a 30-year fixed loan with 20% down at the shown national average rate. Taxes, insurance, and HOA dues are not included, and local quotes will differ.",
          },
        },
        {
          "@type": "Question",
          name: "When does SplanAI publish its own demand data for a metro?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Only once a metro has at least 10 anonymized samples, always labeled 'based on N samples'. Metros below that floor show 'coming soon' instead of estimates.",
          },
        },
      ],
    },
  ],
};

export default async function PulseHubPage() {
  const snapshot = await getLatestPulseSnapshot();

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PulseViewPing metro="hub" />
      <PulseHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          Builder Market Pulse
        </p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-slate-900">
          The two numbers behind every pre-sale conversation, updated weekly
        </h1>

        {/* GEO citation passage (134–167 words, test-enforced) */}
        <p className="mt-5 text-base leading-relaxed text-slate-600">
          {buildPulseGeoPassage(null)}
        </p>

        {/* This week's payment table */}
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900">
            What a monthly payment looks like this week
          </h2>
          <div className="mt-4">
            {snapshot?.rate ? (
              <PaymentTable rate={snapshot.rate} />
            ) : (
              <UpdatingNote what="this week's rate and payment table" />
            )}
          </div>
          {snapshot && snapshot.status !== "complete" && (
            <div className="mt-3">
              <PartialSnapshotNote />
            </div>
          )}
        </section>

        {/* Metro pages */}
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900">Metro pulse pages</h2>
          <p className="mt-2 text-sm text-slate-500">
            Single-family permit activity per metro (U.S. Census Bureau Building Permits Survey,
            1-unit structures, via FRED) plus the payment table above.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {PULSE_METROS.map((m) => {
              const permits = snapshot?.metros?.[m.slug]?.permits ?? null;
              return (
                <Link
                  key={m.slug}
                  href={`/pulse/${m.slug}`}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-400"
                >
                  <p className="font-bold text-slate-900 group-hover:text-blue-600">
                    {m.name}, {m.stateCode} →
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {permits
                      ? `${permits.trailing12moUnits.toLocaleString("en-US")} single-family permits, trailing 12 months (as of ${fmtMonth(permits.latestMonth)})`
                      : "Permit data: updating"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Subscribe */}
        <section className="mt-12 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-extrabold text-slate-900">Weekly builder market digest</h2>
          <p className="mt-2 mb-5 text-sm text-slate-500">
            The same numbers, in your inbox once a week when the digest launches. We store your
            address and metro — nothing is sent until then.
          </p>
          <PulseSubscribeForm metro={null} />
        </section>

        {/* CTA — one line, founder voice */}
        <p className="mt-12 text-sm leading-relaxed text-slate-500">
          SplanAI is my answer to the polished national-builder presentation: three buyer-ready
          home concepts for your lot, priced with a payment view like the table above — if that
          would help your pre-sale conversations,{" "}
          <Link href="/try" className="font-semibold text-blue-600 hover:text-blue-700">
            try the demo
          </Link>{" "}
          or write me at hello@splanai.com.
        </p>
      </main>

      <PulseFooter />
    </div>
  );
}
