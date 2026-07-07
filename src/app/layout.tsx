import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { buildMarketLanguageAlternates } from "@/lib/market";
import { requestOriginFromHeaders } from "@/lib/request-url";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOriginFromHeaders(await headers());
  return {
    metadataBase: new URL(origin),
    title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
    description:
      "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds. An AI sales tool for home builders — win the deal before the build with a shareable portal and a branded PDF.",
    robots: "index, follow",
    alternates: { languages: buildMarketLanguageAlternates("/") },
    openGraph: {
      type: "website",
      siteName: "SplanAI",
      url: origin,
      title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
      description:
        "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds. Win the deal before the build.",
      images: [{ url: `${origin}/og-image.png`, width: 1200, height: 630, alt: "SplanAI — AI Pre-Sale Proposals for Home Builders" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
      description: "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds.",
      images: [`${origin}/og-image.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
