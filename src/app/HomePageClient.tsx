"use client";

import { useState } from "react";
import { T, type Lang } from "./lp-copy";
import { LP_ROUTES } from "./lp-routes";
import { SAMPLE_PORTAL, formatCostRange, formatSqft, sampleSqftRange } from "./lp-sample";
import { Icon, PAIN_ICONS, HOW_ICONS, DIFF_ICONS } from "./lp-icons";
import { track } from "@vercel/analytics";

// ── Constants ────────────────────────────────────────────────────────
// Fishing-pond mode (DEC-0815B): self-serve is the primary entrance — /try (no signup) → free account (3/mo) → trial.
const CUSTOM_PLAN_MAILTO = "mailto:hello@splanai.com?subject=SplanAI%20Custom%20plan%20inquiry&body=Team%20size%3A%0D%0AProposals%20per%20month%3A%0D%0AMarkets%20%2F%20MLS%3A%0D%0A"
// Set NEXT_PUBLIC_CALENDLY_URL in Vercel env to activate Calendly CTA; falls back to mailto until configured
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";
const CALENDLY_READY = Boolean(CALENDLY_URL && !CALENDLY_URL.startsWith("<<FILL"));

// ── Entrance reveal — CSS scroll-driven (globals.css `.reveal`), zero JS ──
// Nothing is hidden in the server HTML: unsupported browsers and
// reduced-motion users simply see the content. `step` staggers siblings.
function Reveal({ children, className = "", step = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; step?: 0 | 1 | 2; as?: "div" | "li" }) {
  const stagger = step === 1 ? " reveal-s1" : step === 2 ? " reveal-s2" : "";
  return <Tag className={`reveal${stagger} ${className}`.trim()}>{children}</Tag>;
}

// ── Hero proof: the live sample portal (/s/nfhkewvz), static markup, zero JS ──
// Every number comes from SAMPLE_PORTAL (pinned to production data by
// lp-sample.test.ts). The PLAN 1/2/3 badge colours mirror the portal's own
// pills — the one place DESIGN.md allows the three plan colours.
type SampleCopy = (typeof T)[Lang]["sample"];
const PLAN_BADGE = ["bg-blue-500/15 text-blue-300", "bg-emerald-500/15 text-emerald-300", "bg-violet-500/15 text-violet-300"] as const;

// Architectural dimension string — the card's only ornament.
function DimensionLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 text-slate-500" aria-hidden="true">
      <span className="relative flex-1 h-px bg-slate-600 before:absolute before:left-0 before:-top-1 before:h-2.5 before:w-px before:bg-slate-500" />
      <span className="text-[11px] font-semibold uppercase tracking-widest tabular-nums whitespace-nowrap">{label}</span>
      <span className="relative flex-1 h-px bg-slate-600 after:absolute after:right-0 after:-top-1 after:h-2.5 after:w-px after:bg-slate-500" />
    </div>
  );
}

function SampleProposalCard({ t }: { t: SampleCopy }) {
  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 lg:justify-self-end">
      <DimensionLine label={`${sampleSqftRange()} ${t.sqft} · ${t.concepts}`} />
      <div className="rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl overflow-hidden">
        <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-5 py-3 border-b border-slate-700">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <a href={LP_ROUTES.livePortal} target="_blank" rel="noopener noreferrer"
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
            onClick={() => track("cta_click", { button: "hero_portal_link" })}
          >{t.open}</a>
        </div>
        <ol className="divide-y divide-slate-700">
          {SAMPLE_PORTAL.plans.map((p, i) => (
            <li key={p.name} className="px-5 py-4 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-x-3 sm:gap-x-4 gap-y-1 items-start">
              <span className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${PLAN_BADGE[i]}`}>{t.plan} {i + 1}</span>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm leading-snug">{p.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{p.style}</p>
                <p className="text-xs text-slate-300 mt-1 tabular-nums">
                  {formatSqft(p.sqft)} {t.sqft} · {p.beds} {t.bd} · {p.baths} {t.ba} · {p.stories} {p.stories === 1 ? t.story : t.stories}
                </p>
              </div>
              <p className="col-start-2 sm:col-start-auto text-base font-extrabold text-white tabular-nums whitespace-nowrap">{formatCostRange(p.cost)}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 bg-slate-900/60 border-t border-slate-700 text-xs text-slate-500">
          <span>{t.estRange}</span>
          <span>{t.foot}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────
// `signedIn` is decided on the server from cookie names (page.tsx) so this
// page ships no Supabase client and makes no auth request per view.
export default function Home({ signedIn = false }: { signedIn?: boolean }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];

  const [teamCheckoutLoading, setTeamCheckoutLoading] = useState(false);
  async function handleLPTeamCTA() {
    if (!signedIn) { window.location.href = LP_ROUTES.signupTeam; return; }
    setTeamCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "team" }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fall through */ }
    window.location.href = LP_ROUTES.signupTeam;
    setTeamCheckoutLoading(false);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">

      {/* ── 1. Nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-900">
        <div className="relative max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Plain anchors throughout the LP (no next/link): no prefetch, no client router — the page must stay light. */}
          <a href={LP_ROUTES.home} className="text-xl font-extrabold tracking-tight text-white shrink-0">
            Splan<span className="text-blue-400">AI</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400 absolute left-1/2 -translate-x-1/2">
            <a href="#how" className="hover:text-white transition-colors">{t.nav.how}</a>
            <a href={LP_ROUTES.pricing} className="hover:text-white transition-colors">{t.nav.pricing}</a>
            <a href="#reviews" className="hover:text-white transition-colors">{t.nav.reviews}</a>
            <a href={LP_ROUTES.blog} className="hover:text-white transition-colors">{t.nav.blog}</a>
          </nav>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              aria-label={lang === "en" ? "Cambiar idioma a español" : "Switch language to English"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
              {lang === "en" ? "ES" : "EN"}
            </button>
            {signedIn ? (
              <a href={LP_ROUTES.dashboard} className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.dashboard}</a>
            ) : (
              <a href={LP_ROUTES.signin} className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.signin}</a>
            )}
            <a href={LP_ROUTES.signupFree} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-600 text-slate-200 hover:border-slate-400 hover:text-white transition-colors"
              onClick={() => track("cta_click", { button: "nav_cta" })}
            >{t.nav.cta}</a>
          </div>
        </div>
      </header>

      {/* ── 2. Hero — the real sample, one filled CTA ───────────────── */}
      <section className="relative overflow-clip bg-slate-900 blueprint-grid">
        <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] items-center gap-12 lg:gap-16">
            <div className="text-center lg:text-left max-w-xl mx-auto lg:mx-0">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-balance text-white mb-5">
                {t.hero.headline1}{" "}
                <span className="text-blue-400">{t.hero.headline2}</span>
              </h1>
              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0">{t.hero.sub}</p>
              <div className="flex flex-col items-center lg:items-start gap-4 mb-10">
                <a href={LP_ROUTES.try} className="inline-flex items-center justify-center w-full sm:w-auto px-7 py-4 rounded-xl text-white font-bold text-base bg-blue-500 hover:bg-blue-600 transition-colors"
                  onClick={() => track("cta_click", { button: "hero_primary" })}
                >{t.hero.ctaPrimary}</a>
                <a href={LP_ROUTES.signupFree} className="text-sm text-slate-400 underline underline-offset-4 decoration-slate-600 hover:text-white hover:decoration-slate-400 transition-colors"
                  onClick={() => track("cta_click", { button: "hero_secondary_signup" })}
                >{t.hero.ctaSecondary}</a>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-8 justify-center lg:justify-start">
                {[t.hero.stat1, t.hero.stat2, t.hero.stat3].map((s, i) => (
                  <div key={i} className="text-center lg:text-left">
                    <p className="text-lg sm:text-2xl font-extrabold text-white whitespace-nowrap tabular-nums">{s.value}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-0.5 whitespace-nowrap">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <SampleProposalCard t={t.sample} />
          </div>
        </div>
      </section>

      {/* ── 3. Pain Points ──────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.pain.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.pain.sub}</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.pain.items.map((item, i) => (
              <Reveal key={i} step={(i % 3) as 0 | 1 | 2}>
                <div className="rounded-2xl p-7 border border-slate-200 bg-slate-50 flex flex-col gap-3 h-full">
                  <Icon name={PAIN_ICONS[i]} className="w-7 h-7 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base leading-snug">{item.headline}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">{item.body}</p>
                  <p className="text-blue-600 text-sm font-bold border-t border-slate-200 pt-4">→ {item.solution}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. How it works — numbered, editorial ───────────────────── */}
      <section id="how" className="py-20 px-6 bg-slate-900">
        <div className="max-w-5xl mx-auto">
          <Reveal className="mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance text-white">{t.how.heading}</h2>
          </Reveal>
          <ol className="border-t border-slate-800">
            {t.how.steps.map((step, i) => (
              <Reveal as="li" key={step.step} step={(i % 3) as 0 | 1 | 2} className="grid grid-cols-[3rem_1fr] sm:grid-cols-[5rem_minmax(0,18rem)_1fr] gap-x-4 sm:gap-x-8 gap-y-2 py-7 border-b border-slate-800 items-start">
                <span className="flex items-center gap-2 pt-1 text-xs font-bold text-blue-400 tracking-widest tabular-nums">
                  <Icon name={HOW_ICONS[i]} className="w-4 h-4 hidden sm:block" />
                  {step.step}
                </span>
                <h3 className="font-bold text-white text-lg leading-snug">{step.title}</h3>
                <p className="col-start-2 sm:col-start-3 text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </Reveal>
            ))}
          </ol>
          <p className="mt-5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">{t.data.label}:</span> {t.data.items.join(" · ")}
          </p>
        </div>
      </section>

      {/* ── 5. Differentiators ──────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-14">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">{t.diff.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.diff.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.diff.sub}</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.diff.items.map((item, i) => (
              <Reveal key={item.title} step={(i % 3) as 0 | 1 | 2}>
                <div className="flex flex-col gap-4 p-7 rounded-2xl border border-slate-200 bg-slate-50 hover:border-blue-200 transition-colors h-full">
                  <Icon name={DIFF_ICONS[i]} className="w-7 h-7 text-blue-600" />
                  <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Proof — the portal your buyer opens, and MLS on Pro ───── */}
      <section id="reviews" className="py-16 px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <Reveal className="rounded-2xl border border-slate-200 bg-white p-7 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-2 w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <h3 className="font-bold text-slate-900 text-base leading-snug">{t.proof.portalTitle}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed flex-1">{t.proof.portalBody}</p>
            <a href={LP_ROUTES.livePortal} target="_blank" rel="noopener noreferrer"
              className="self-start px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              onClick={() => track("cta_click", { button: "proof_portal_link" })}
            >{t.proof.portalCta}</a>
          </Reveal>
          <Reveal step={1} className="rounded-2xl border border-amber-200 bg-white p-7 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500 text-slate-900">PRO</span>
              <h3 className="font-bold text-slate-900 text-base">{t.proof.mlsTitle}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{t.proof.mlsBody}</p>
          </Reveal>
        </div>
      </section>

      {/* ── 7. Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-ink-deep">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-white">{t.pricing.heading}</h2>
            <p className="text-slate-400">{t.pricing.sub}</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <div className="rounded-2xl p-7 flex flex-col gap-5 border border-slate-700/60 bg-slate-800">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.pricing.free.label}</p>
                <p className="text-4xl font-extrabold text-white mt-2">{t.pricing.free.price}</p>
                <p className="text-sm text-slate-500 mt-1">{t.pricing.free.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.free.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>{f}
                  </li>
                ))}
              </ul>
              <a href={LP_ROUTES.signupFree} className="block text-center py-3 rounded-xl border border-slate-600 font-bold text-slate-300 hover:border-slate-400 hover:text-white transition-all text-sm">
                {t.pricing.free.cta}
              </a>
            </div>
            {/* Pro */}
            <div className="rounded-2xl p-7 sm:py-10 flex flex-col gap-5 relative overflow-hidden border border-blue-500/40 bg-slate-900 shadow-[0_8px_40px_rgba(59,130,246,0.30)]">
              <div className="absolute top-4 right-4 text-xs font-bold px-2.5 py-1 rounded-full text-white bg-blue-500">
                {t.pricing.pro.badge}
              </div>
              <div>
                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">{t.pricing.pro.label}</p>
                <p className="text-4xl font-extrabold text-white mt-2">
                  {t.pricing.pro.price}<span className="text-base font-medium text-slate-400">{t.pricing.pro.period}</span>
                </p>
                <p className="text-sm text-slate-400 mt-1">{t.pricing.pro.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.pro.features.map((f, i) => (
                  <li key={f} className={`flex items-center gap-2.5 text-sm ${i === 0 ? "text-blue-300 font-medium" : "text-slate-200"}`}>
                    <svg className="w-4 h-4 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>{f}
                  </li>
                ))}
              </ul>
              <a href={LP_ROUTES.signupPro} className="block text-center py-3 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors shadow-lg text-sm"
              >{t.pricing.pro.cta}</a>
            </div>
            {/* Team — gold left border accent */}
            <div className="rounded-2xl p-7 sm:py-9 flex flex-col gap-5 relative overflow-hidden shadow-2xl bg-slate-900 border border-amber-500/15 border-l-4 border-l-amber-500">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-500">{t.pricing.team.label}</p>
                <p className="text-4xl font-extrabold text-white mt-2">
                  {t.pricing.team.price}<span className="text-base font-medium text-slate-400">{t.pricing.team.period}</span>
                </p>
                <p className="text-sm text-slate-400 mt-1">{t.pricing.team.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.team.features.map((f, i) => (
                  <li key={f} className={`flex items-center gap-2.5 text-sm ${i === 0 ? "font-medium text-amber-500" : "text-slate-200"}`}>
                    <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleLPTeamCTA}
                disabled={teamCheckoutLoading}
                className="block w-full text-center py-3 rounded-xl font-bold text-slate-900 bg-amber-500 hover:bg-amber-600 transition-colors shadow-lg text-sm disabled:opacity-60 cursor-pointer"
              >{teamCheckoutLoading ? t.pricing.team.redirecting : t.pricing.team.cta}</button>
            </div>

            {/* Custom — sales-led, no price shown */}
            <div className="hidden sm:flex rounded-2xl p-7 flex-col gap-5 border border-slate-600/60 bg-slate-900">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.pricing.custom.label}</p>
                <p className="text-2xl font-extrabold text-white mt-2">{t.customPrice}</p>
                <p className="text-sm text-slate-500 mt-1">{t.customPriceSub}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.custom.features.map((f, i) => (
                  <li key={f} className={`flex items-center gap-2.5 text-sm ${i === 0 ? "text-slate-300 font-medium" : "text-slate-400"}`}>
                    <svg className="w-4 h-4 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>{f}
                  </li>
                ))}
              </ul>
              {/* Calendly when NEXT_PUBLIC_CALENDLY_URL is set; fallback to mailto */}
              <a
                href={CALENDLY_READY ? CALENDLY_URL : CUSTOM_PLAN_MAILTO}
                target={CALENDLY_READY ? "_blank" : undefined}
                rel={CALENDLY_READY ? "noopener noreferrer" : undefined}
                className="block text-center py-3 rounded-xl border border-slate-500 font-bold text-slate-300 hover:border-slate-300 hover:text-white transition-all text-sm"
              >{t.pricing.custom.cta}</a>
            </div>
          </div>
          <p className="sm:hidden mt-6 text-center text-sm text-slate-400">
            <a
              href={CALENDLY_READY ? CALENDLY_URL : CUSTOM_PLAN_MAILTO}
              target={CALENDLY_READY ? "_blank" : undefined}
              rel={CALENDLY_READY ? "noopener noreferrer" : undefined}
              className="underline hover:text-white transition-colors"
            >{t.pricing.custom.mobileCta}</a>
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {t.reassure.map(item => (
              <span key={item} className="flex items-center gap-1.5 text-sm text-slate-300">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-center text-slate-400">{t.pricing.footer}</p>
          <p className="mt-3 text-xs text-center text-slate-400">
            *{lang === 'en' ? (
              <>Subject to our <a href={LP_ROUTES.fairUse} className="underline hover:text-white transition-colors">Fair Use Policy</a>.</>
            ) : (
              <>Sujeto a nuestra <a href={LP_ROUTES.fairUse} className="underline hover:text-white transition-colors">Política de Uso Justo</a>.</>
            )}
          </p>
          <p className="mt-2 text-sm text-center text-slate-400">
            {lang === 'en' ? (
              <>Not ready to sign up? <a href={LP_ROUTES.try} className="underline hover:text-white transition-colors">Try a sample proposal</a> — no signup needed.</>
            ) : (
              <>¿Aún no quieres registrarte? <a href={LP_ROUTES.try} className="underline hover:text-white transition-colors">Prueba una propuesta de muestra</a> — sin registro.</>
            )}
          </p>
          <p className="mt-8 text-xs text-center text-slate-500">{t.security.line}</p>
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.faqHeading}</h2>
          </div>
          <div className="space-y-4">
            {t.faq.map((item) => (
              <details key={item.q} className="group rounded-2xl border-2 border-slate-100 hover:border-blue-100 transition-colors overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none font-semibold text-slate-800 text-sm sm:text-base select-none">
                  {item.q}
                  <svg className="w-5 h-5 text-slate-400 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-4">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. CTA Banner ──────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-clip bg-slate-900 blueprint-grid">
        <Reveal className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-balance text-white mb-5">{t.ctaBanner.heading}</h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">{t.ctaBanner.sub}</p>
          <a href={LP_ROUTES.signupFree}
            onClick={() => track("cta_click", { button: "banner_signup" })}
            className="inline-flex items-center gap-3 px-6 sm:px-10 py-5 rounded-2xl text-white text-lg sm:text-xl font-bold bg-blue-500 hover:bg-blue-600 transition-colors"
          >
            {t.ctaBanner.cta}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </Reveal>
      </section>

      {/* ── 10. Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 py-8 px-6 bg-slate-900">
        {/* Mobile: vertical stack / Desktop: horizontal row */}
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:relative">
          {/* Logo */}
          <span className="text-lg font-extrabold text-white">Splan<span className="text-blue-400">AI</span></span>

          {/* Center: copyright + email */}
          <div className="flex flex-col items-center gap-1 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            <p className="text-sm text-slate-500 text-center whitespace-nowrap">{t.footer}</p>
            <a href="mailto:hello@splanai.com" className="inline-block py-1 text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Questions? hello@splanai.com
            </a>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-5 text-sm text-slate-500 sm:ml-auto">
            <a href={LP_ROUTES.pricing} className="py-2 hover:text-slate-300 transition-colors">{t.nav.pricing}</a>
            <a href={LP_ROUTES.partners} className="py-2 hover:text-slate-300 transition-colors">Partners</a>
            <a href={LP_ROUTES.terms} className="py-2 hover:text-slate-300 transition-colors">Terms</a>
            <a href={LP_ROUTES.privacy} className="py-2 hover:text-slate-300 transition-colors">Privacy</a>
            <a href={LP_ROUTES.signin} className="py-2 hover:text-slate-300 transition-colors">{t.nav.signin}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
