"use client";

type BadgeState = "pre-launch" | "launch-day" | "post-launch" | "top-product";

interface ProductHuntBadgeProps {
  state: BadgeState;
  lang?: "en" | "es";
}

export function ProductHuntBadge({ state, lang = "en" }: ProductHuntBadgeProps) {
  if (state === "top-product") {
    return (
      <a
        href="https://www.producthunt.com/products/splanai?launch=splanai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-bold tracking-widest uppercase rounded-full border transition-colors cursor-pointer text-amber-300 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        {lang === "en"
          ? "🏆 #1 Product of the Day on ProductHunt"
          : "🏆 #1 Producto del Día en ProductHunt"}
      </a>
    );
  }

  if (state === "launch-day") {
    return (
      <a
        href="https://www.producthunt.com/products/splanai?launch=splanai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-bold tracking-widest uppercase rounded-full border transition-colors cursor-pointer text-orange-300 bg-orange-500/15 border-orange-400/40 hover:bg-orange-500/25"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-400" />
        </span>
        {lang === "en"
          ? "🚀 LIVE on ProductHunt — Upvote us today!"
          : "🚀 ¡EN VIVO en ProductHunt — Vótanos hoy!"}
      </a>
    );
  }

  if (state === "post-launch") {
    return (
      <a
        href="https://www.producthunt.com/products/splanai?launch=splanai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-semibold tracking-widest uppercase rounded-full border transition-colors cursor-pointer text-slate-400 bg-slate-500/10 border-slate-500/20 hover:text-slate-300 hover:bg-slate-500/20"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {lang === "en"
          ? "🏆 Featured on Product Hunt"
          : "🏆 Destacado en Product Hunt"}
      </a>
    );
  }

  // pre-launch (default)
  return (
    <a
      href="https://www.producthunt.com/products/splanai?launch=splanai"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-bold tracking-widest uppercase rounded-full border transition-colors cursor-pointer text-blue-300 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-400"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      {lang === "en"
        ? "🚀 Launching on ProductHunt · May 26"
        : "🚀 Lanzamiento en ProductHunt · 26 de mayo"}
    </a>
  );
}
