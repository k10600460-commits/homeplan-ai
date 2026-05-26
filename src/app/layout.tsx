import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SplanAI — AI Floor Plan Generator for Home Builders",
  description:
    "Turn any lot into 3 custom floor plan proposals in 30 seconds. AI-powered tool built for home builders. Close more deals with polished PDF proposals.",
  robots: "index, follow",
  openGraph: {
    type: "website",
    siteName: "SplanAI",
    url: "https://splanai.com",
    title: "SplanAI — AI Floor Plan Generator for Home Builders",
    description:
      "Turn any lot into 3 custom floor plan proposals in 30 seconds. Close more deals with polished PDF proposals.",
    images: [{ url: "https://splanai.com/og-image.png", width: 1200, height: 630, alt: "SplanAI — AI Floor Plans for Home Builders" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SplanAI — AI Floor Plan Generator for Home Builders",
    description: "Turn any lot into 3 custom floor plan proposals in 30 seconds.",
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
