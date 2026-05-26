import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = {
  alternates: { canonical: "https://splanai.com" },
};

export default function Page() {
  return <HomePageClient />;
}
