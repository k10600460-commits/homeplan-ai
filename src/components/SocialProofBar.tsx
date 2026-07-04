"use client";

export function SocialProofBar({ lang = "en" }: { lang?: "en" | "es" }) {
  return (
    <div className="border-b border-slate-800/50 py-3 px-6 bg-ink-deep">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <a
          href="https://www.producthunt.com/products/splanai?launch=splanai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          {lang === "en" ? "Featured on Product Hunt" : "Destacado en Product Hunt"}
        </a>

        <span className="hidden sm:block text-slate-700 text-xs select-none">·</span>

        <span className="text-xs text-slate-500">
          {lang === "en" ? "No credit card required" : "Sin tarjeta de crédito"}
        </span>
      </div>
    </div>
  );
}
