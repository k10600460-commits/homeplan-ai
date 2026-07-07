import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import ToolsHubClient from "./ToolsHubClient";

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    title: "Free tools for home builders — no signup | SplanAI",
    description:
      "Two small, free tools for builder conversations: turn a lot and budget into a monthly payment, and get a quick lot-feasibility gut check. No signup, no email.",
    alternates: { canonical: `${origin}/tools`, languages: buildMarketLanguageAlternates("/tools") },
  };
}

export default function ToolsPage() {
  return <ToolsHubClient />;
}
