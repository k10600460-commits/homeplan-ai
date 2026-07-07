import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import PaymentCalculatorClient from "./PaymentCalculatorClient";

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    title: "Lot → Monthly Payment calculator — free, no signup | SplanAI",
    description:
      "Turn a home price — or a lot plus build budget — into the monthly principal & interest number buyers ask about. Today's average 30-yr rate preloaded, editable. Free, no signup.",
    alternates: { canonical: `${origin}/tools/payment-calculator`, languages: buildMarketLanguageAlternates("/tools/payment-calculator") },
  };
}

export default function PaymentCalculatorPage() {
  return <PaymentCalculatorClient />;
}
