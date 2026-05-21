import type { NextConfig } from "next";

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
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
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
