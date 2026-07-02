"use client";

import { useEffect } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";

const TOOLS = [
  {
    href: "/tools/payment-calculator",
    name: "Lot → Monthly Payment",
    blurb: "Turn a home price (or lot + build budget) into the monthly payment buyers actually ask about, with today's average 30-yr rate preloaded.",
  },
  {
    href: "/tools/lot-feasibility",
    name: "Lot Feasibility Checker",
    blurb: "Three questions in, plain-English feasibility hints out — plus the verify-locally checklist worth running before you promise anything.",
  },
] as const;

export default function ToolsHubClient() {
  useEffect(() => {
    track("tools_view", { tool: "hub" });
  }, []);

  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
        Free tools for builders
      </h1>
      <p className="text-slate-400 leading-relaxed mb-10 max-w-xl">
        Small calculators I use in builder conversations, pulled out of SplanAI so you can use
        them on their own. Free, no signup — they run right in your browser.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-2xl border border-slate-700 bg-slate-900/80 p-6 hover:border-blue-500/60 transition-colors"
          >
            <h2 className="text-lg font-extrabold text-white mb-2 group-hover:text-blue-300 transition-colors">
              {tool.name}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">{tool.blurb}</p>
            <p className="text-sm font-semibold text-blue-400 mt-4">Open →</p>
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-10 max-w-xl">
        These tools are estimates and rules of thumb — useful for the first conversation, not a
        substitute for local numbers. The full SplanAI flow turns the same inputs into three
        buyer-ready concept proposals.
      </p>
    </div>
  );
}
