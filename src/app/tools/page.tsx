import type { Metadata } from "next";
import ToolsHubClient from "./ToolsHubClient";

export const metadata: Metadata = {
  title: "Free tools for home builders — no signup | SplanAI",
  description:
    "Two small, free tools for builder conversations: turn a lot and budget into a monthly payment, and get a quick lot-feasibility gut check. No signup, no email.",
  alternates: { canonical: "https://splanai.com/tools" },
};

export default function ToolsPage() {
  return <ToolsHubClient />;
}
