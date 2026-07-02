import type { Metadata } from "next";
import PaymentCalculatorClient from "./PaymentCalculatorClient";

export const metadata: Metadata = {
  title: "Lot → Monthly Payment calculator — free, no signup | SplanAI",
  description:
    "Turn a home price — or a lot plus build budget — into the monthly principal & interest number buyers ask about. Today's average 30-yr rate preloaded, editable. Free, no signup.",
  alternates: { canonical: "https://splanai.com/tools/payment-calculator" },
};

export default function PaymentCalculatorPage() {
  return <PaymentCalculatorClient />;
}
