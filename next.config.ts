import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
