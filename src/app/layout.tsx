import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
  description:
    "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds. An AI sales tool for home builders — win the deal before the build with a shareable portal and a branded PDF.",
  robots: "index, follow",
  openGraph: {
    type: "website",
    siteName: "SplanAI",
    url: "https://splanai.com",
    title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
    description:
      "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds. Win the deal before the build.",
    images: [{ url: "https://splanai.com/og-image.png", width: 1200, height: 630, alt: "SplanAI — AI Pre-Sale Proposals for Home Builders" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SplanAI — AI Pre-Sale Proposals for Home Builders",
    description: "Turn a lot into 3 buyer-ready home concept proposals in 30 seconds.",
    images: ["https://splanai.com/og-image.png"],
  },
};

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
