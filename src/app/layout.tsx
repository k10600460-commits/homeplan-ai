import type { Metadata } from "next";
import { Geist } from "next/font/google";
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
  alternates: { canonical: "https://homeplan-ai.vercel.app" },
  openGraph: {
    type: "website",
    url: "https://homeplan-ai.vercel.app",
    title: "SplanAI — AI Floor Plan Generator for Home Builders",
    description:
      "Turn any lot into 3 custom floor plan proposals in 30 seconds. Close more deals with polished PDF proposals.",
    images: [{ url: "https://homeplan-ai.vercel.app/og-image.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SplanAI — AI Floor Plan Generator for Home Builders",
    description: "Turn any lot into 3 custom floor plan proposals in 30 seconds.",
    images: ["https://homeplan-ai.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white">{children}</body>
    </html>
  );
}
