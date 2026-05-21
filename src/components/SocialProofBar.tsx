"use client";

const STATES = ["TX", "FL", "CA", "AZ"];

export function SocialProofBar({ lang = "en" }: { lang?: "en" | "es" }) {
  return (
    <div className="border-b border-slate-800/50 py-3 px-6" style={{ background: "#0B1628" }}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          {lang === "en" ? "7 builders in active beta" : "7 constructores en beta activa"}
        </span>

        <span className="hidden sm:block text-slate-700 text-xs select-none">·</span>

        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span>{lang === "en" ? "Active in" : "Activo en"}</span>
          <span className="flex gap-1">
            {STATES.map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700"
              >
                {s}
              </span>
            ))}
          </span>
        </span>

        <span className="hidden sm:block text-slate-700 text-xs select-none">·</span>

        <span className="text-xs text-slate-500">
          {lang === "en" ? "No credit card required" : "Sin tarjeta de crédito"}
        </span>
      </div>
    </div>
  );
}
