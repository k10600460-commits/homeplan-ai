import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import LotFeasibilityClient from "./LotFeasibilityClient";

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    title: "Lot Feasibility Checker — free, no signup | SplanAI",
    description:
      "Three questions — state, lot size, budget band — and you get plain-English feasibility hints plus the verify-locally checklist. General rules of thumb only; zoning varies. Free, no signup.",
    alternates: { canonical: `${origin}/tools/lot-feasibility`, languages: buildMarketLanguageAlternates("/tools/lot-feasibility") },
  };
}

export default function LotFeasibilityPage() {
  return <LotFeasibilityClient />;
}
