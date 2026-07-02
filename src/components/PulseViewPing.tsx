"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";

// KPI instrumentation for /pulse (same @vercel/analytics track() convention as
// HomePageClient). Pages are ISR-cached, so the view event must fire
// client-side; metro="hub" for /pulse itself.
export function PulseViewPing({ metro }: { metro: string }) {
  useEffect(() => {
    track("pulse_view", { metro });
  }, [metro]);
  return null;
}
