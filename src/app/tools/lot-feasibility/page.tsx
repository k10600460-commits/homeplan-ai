import type { Metadata } from "next";
import LotFeasibilityClient from "./LotFeasibilityClient";

export const metadata: Metadata = {
  title: "Lot Feasibility Checker — free, no signup | SplanAI",
  description:
    "Three questions — state, lot size, budget band — and you get plain-English feasibility hints plus the verify-locally checklist. General rules of thumb only; zoning varies. Free, no signup.",
  alternates: { canonical: "https://splanai.com/tools/lot-feasibility" },
};

export default function LotFeasibilityPage() {
  return <LotFeasibilityClient />;
}
