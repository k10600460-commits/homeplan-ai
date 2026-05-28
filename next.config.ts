import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Supabase project URL — used for connect-src (REST + Realtime WebSocket)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://sabriblwzzsvxsfxoebe.supabase.co";
const supabaseWs = supabaseUrl.replace(/^https/, "wss");

// Report-Only: capture violations without blocking. Switch to
// Content-Security-Policy once violations are resolved in Preview.
const cspReportOnly = [
  "default-src 'self'",
  // Next.js injects inline __NEXT_DATA__ scripts → unsafe-inline required
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  // Tailwind / React inline styles → unsafe-inline required
  "style-src 'self' 'unsafe-inline'",
  // data: for jspdf canvas; blob: for PDF download
  "img-src 'self' data: blob:",
  // Geist font is self-hosted by next/font at build time
  "font-src 'self'",
  // Browser-side API calls: own routes + Supabase (REST & Realtime) + Vercel Analytics
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://vitals.vercel-insights.com`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // HSTS: production only (avoid locking localhost to HTTPS in dev)
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: cspReportOnly,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      { source: "/sign-up",      destination: "/login?tab=signup", permanent: true },
      { source: "/signup",       destination: "/login?tab=signup", permanent: true },
      { source: "/register",     destination: "/login?tab=signup", permanent: true },
      { source: "/auth/signup",  destination: "/login?tab=signup", permanent: true },
      { source: "/auth/sign-up", destination: "/login?tab=signup", permanent: true },
    ];
  },
};

export default nextConfig;
