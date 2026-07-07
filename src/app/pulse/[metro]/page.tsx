import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPulseMetro, PULSE_METROS } from "@/data/pulse-metros";
import {
  buildPulseGeoPassage,
  fmtMonth,
  getLatestPulseSnapshot,
  publishableAggregates,
  PULSE_AGG_MIN_N,
} from "@/lib/pulse";
import { PulseSubscribeForm } from "@/components/PulseSubscribeForm";
import { PulseViewPing } from "@/components/PulseViewPing";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import {
  PartialSnapshotNote,
  PaymentTable,
  PulseFooter,
  PulseHeader,
  serializeJsonLd,
  UpdatingNote,
} from "../pulse-ui";

// Ten static metro pages; anything else 404s. Regenerated hourly so the
// weekly snapshot shows up without a deploy.
export const revalidate = 3600;
export const dynamicParams = false;

interface Params {
  params: Promise<{ metro: string }>;
}

export function generateStaticParams() {
  return PULSE_METROS.map((m) => ({ metro: m.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { metro: slug } = await params;
  const metro = getPulseMetro(slug);
  if (!metro) return {};
  const origin = requestOriginFromHeaders(await headers());
  return {
    title: `${metro.name}, ${metro.stateCode} Builder Market Pulse — payments & single-family permits | SplanAI`,
    description: `Weekly ${metro.name} data page for home builders: the Freddie Mac PMMS 30-year fixed rate as a monthly-payment table ($300k–$800k, 20% down) and single-family permit counts for ${metro.msaName} from the U.S. Census Bureau via FRED.`,
    alternates: { canonical: `${origin}/pulse/${metro.slug}`, languages: buildMarketLanguageAlternates(`/pulse/${metro.slug}`) },
  };
}

export default async function PulseMetroPage({ params }: Params) {
  const { metro: slug } = await params;
  const metro = getPulseMetro(slug);
  if (!metro) notFound();

  const snapshot = await getLatestPulseSnapshot();
  const metroSnap = snapshot?.metros?.[metro.slug] ?? null;
  const permits = metroSnap?.permits ?? null;
  const aggregates = publishableAggregates(metroSnap?.aggregates);
  const origin = requestOriginFromHeaders(await headers());
  const canonical = `${origin}/pulse/${metro.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        "@id": `${canonical}#dataset`,
        name: `SplanAI Builder Market Pulse — ${metro.name}, ${metro.stateCode}`,
        description: `Weekly snapshot for ${metro.msaName}: the Freddie Mac PMMS 30-year fixed mortgage rate (FRED series MORTGAGE30US) as a monthly-payment table for $300,000–$800,000 homes at 20% down, and single-family (1-unit) housing units authorized by building permits from the U.S. Census Bureau Building Permits Survey (FRED series ${metro.fredPermitsSeriesId}).`,
        url: canonical,
        creator: { "@type": "Organization", name: "SplanAI", url: origin },
        spatialCoverage: { "@type": "Place", name: `${metro.msaName} (MSA)` },
        isBasedOn: ["https://fred.stlouisfed.org/series/MORTGAGE30US", metro.fredSeriesUrl],
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: `Where does the ${metro.name} building-permit data come from?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `From the U.S. Census Bureau Building Permits Survey, published through FRED as series ${metro.fredPermitsSeriesId}: single-family (1-unit structures) housing units authorized in the ${metro.msaName} metro area, monthly, not seasonally adjusted.`,
            },
          },
          {
            "@type": "Question",
            name: "Where does the mortgage rate come from?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "From Freddie Mac's Primary Mortgage Market Survey (30-year fixed average), published through FRED as series MORTGAGE30US. It is a national weekly average — local quotes vary.",
            },
          },
          {
            "@type": "Question",
            name: "How are the monthly payments calculated?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Principal and interest on a 30-year fixed loan with 20% down at the shown rate. Taxes, insurance, and HOA dues are not included.",
            },
          },
        ],
      },
    ],
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PulseViewPing metro={metro.slug} />
      <PulseHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/pulse"
          className="text-sm font-medium text-blue-500 transition-colors hover:text-blue-700"
        >
          ← All metros
        </Link>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-blue-600">
          Builder Market Pulse
        </p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-slate-900">
          {metro.name}, {metro.stateCode}
        </h1>

        {/* GEO citation passage (134–167 words, test-enforced) */}
        <p className="mt-5 text-base leading-relaxed text-slate-600">
          {buildPulseGeoPassage(metro)}
        </p>

        {/* Payment table */}
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900">
            What your buyers&apos; monthly payment looks like this week
          </h2>
          <div className="mt-4">
            {snapshot?.rate ? (
              <PaymentTable rate={snapshot.rate} />
            ) : (
              <UpdatingNote what="this week's rate and payment table" />
            )}
          </div>
        </section>

        {/* Permit activity */}
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900">
            Single-family permits in the {metro.name} metro
          </h2>
          <div className="mt-4">
            {permits ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-3xl font-extrabold text-slate-900">
                      {permits.latestMonthUnits.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      units authorized in {fmtMonth(permits.latestMonth)}
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-slate-900">
                      {permits.trailing12moUnits.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">units, trailing 12 months</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-400">
                  Source: U.S. Census Bureau, Building Permits Survey — single-family (1-unit
                  structures) housing units authorized in {metro.msaName} (MSA), monthly, not
                  seasonally adjusted. Via{" "}
                  <a
                    href={metro.fredSeriesUrl}
                    rel="noopener noreferrer"
                    className="underline hover:text-slate-600"
                  >
                    FRED series {metro.fredPermitsSeriesId}
                  </a>{" "}
                  · latest observation {fmtMonth(permits.latestMonth)}.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                n/a — updating. Permit figures appear after the next weekly refresh. Source when
                live: U.S. Census Bureau Building Permits Survey via{" "}
                <a
                  href={metro.fredSeriesUrl}
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-600"
                >
                  FRED series {metro.fredPermitsSeriesId}
                </a>
                . We only show figures with a source and an as-of date.
              </div>
            )}
          </div>
          {snapshot && snapshot.status !== "complete" && (
            <div className="mt-3">
              <PartialSnapshotNote />
            </div>
          )}
        </section>

        {/* SplanAI anonymized demand data (n>=10 gate) */}
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900">
            What buyers ask SplanAI for in {metro.name}
          </h2>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {aggregates ? (
              <>
                <p className="text-slate-700">
                  <span className="font-bold text-slate-900">
                    {aggregates.generations.toLocaleString("en-US")}
                  </span>{" "}
                  concept generations
                  {aggregates.topStyle && (
                    <>
                      {" "}
                      · most requested direction:{" "}
                      <span className="font-bold text-slate-900">{aggregates.topStyle}</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Anonymized SplanAI usage data, based on {aggregates.n} samples.
                </p>
              </>
            ) : (
              <p>
                Coming soon. We publish anonymized SplanAI generation stats for a metro only once
                it clears {PULSE_AGG_MIN_N} samples, labeled &quot;based on N samples&quot;.{" "}
                {metro.name} hasn&apos;t cleared that floor yet, so this section stays empty — we
                don&apos;t estimate.
              </p>
            )}
          </div>
        </section>

        {/* Subscribe */}
        <section className="mt-12 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-extrabold text-slate-900">
            Weekly {metro.name} market digest
          </h2>
          <p className="mt-2 mb-5 text-sm text-slate-500">
            These numbers for {metro.name}, in your inbox once a week when the digest launches. We
            store your address and metro — nothing is sent until then.
          </p>
          <PulseSubscribeForm metro={metro.slug} />
        </section>

        {/* CTA — one line, founder voice */}
        <p className="mt-12 text-sm leading-relaxed text-slate-500">
          If you build in {metro.name} and want buyer-ready concept proposals that pair a plan
          with this kind of payment math, that&apos;s what SplanAI does —{" "}
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
