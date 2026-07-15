"use client";

export function SocialProofBar({ lang = "en" }: { lang?: "en" | "es" }) {
  return (
    <div className="border-b border-slate-800/50 py-3 px-6 bg-ink-deep">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span className="text-xs text-slate-500">
          {lang === "en" ? "No credit card required" : "Sin tarjeta de crédito"}
        </span>
      </div>
    </div>
  );
}
