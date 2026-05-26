"use client";

export function SocialProofBar({ lang = "en" }: { lang?: "en" | "es" }) {
  return (
    <div className="border-b border-slate-800/50 py-3 px-6" style={{ background: "#0B1628" }}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <a
          href="https://www.producthunt.com/products/splanai?launch=splanai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          {lang === "en" ? "🚀 LIVE on ProductHunt — Upvote us today!" : "🚀 ¡EN VIVO en ProductHunt — Vótanos hoy!"}
        </a>

        <span className="hidden sm:block text-slate-700 text-xs select-none">·</span>

        <span className="text-xs text-slate-500">
          {lang === "en" ? "No credit card required" : "Sin tarjeta de crédito"}
        </span>
      </div>
    </div>
  );
}
