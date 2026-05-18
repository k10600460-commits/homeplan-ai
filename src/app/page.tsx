"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── i18n ─────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    nav: {
      how: "How it works",
      pricing: "Pricing",
      reviews: "Reviews",
      dashboard: "Dashboard",
      signin: "Sign in",
      cta: "Start Free Trial",
    },
    hero: {
      badge: "AI-Powered · Trusted by Home Builders",
      headline1: "Win more deals with ",
      headline2: "AI floor plans",
      headline3: " in 30 seconds",
      sub: "Show clients their dream home before they sign. No architect. No waiting. Just results.",
      ctaPrimary: "Generate Plans Free →",
      ctaSecondary: "See how it works",
      stat1: { value: "30 sec", label: "to generate" },
      stat2: { value: "3 plans", label: "per session" },
      stat3: { value: "14-day", label: "free trial" },
    },
    trust: {
      label: "Powered by industry-leading technology",
    },
    form: {
      title: "Generate your first floor plan — free",
      lotLabel: "Lot Size (sq ft)",
      lotPlaceholder: "e.g. 8500",
      budgetLabel: "Budget (USD)",
      budgetPlaceholder: "e.g. 350000",
      familyLabel: "Family Size",
      familyPlaceholder: "Select…",
      familyOptions: ["1 person", "2 people", "3 people", "4 people", "5 people", "6+ people"],
      cityLabel: "City",
      cityPlaceholder: "e.g. Austin",
      stateLabel: "State",
      statePlaceholder: "e.g. TX",
      locationNote: "Optional — adds neighborhood & market data",
      cta: "Generate 3 Plans →",
      generating: "Generating Plans…",
      disclaimer: "No credit card required · 3 free plans included",
    },
    pain: {
      heading: "Sound familiar?",
      sub: "These are the three biggest deal-killers for home builders today.",
      items: [
        { icon: "😟", title: "Clients can't visualize — and walk away", desc: "When prospects can't picture their future home, they delay decisions. \"Let me think about it\" almost always means a lost deal." },
        { icon: "💸", title: "Architects cost $2,000+ and take weeks", desc: "Hiring a draftsman for every prospect meeting isn't scalable. You're burning money and time on leads that may never convert." },
        { icon: "📉", title: "Competitors show plans — you're losing deals", desc: "Builders who walk into meetings with visual proposals close more. If you're not showing plans, someone else is winning your clients." },
      ],
    },
    how: {
      heading: "How it works",
      steps: [
        { step: "1", title: "Enter lot details", desc: "Provide lot size, budget, and family size. Takes 30 seconds." },
        { step: "2", title: "AI generates 3 plans", desc: "Claude AI designs three optimized floor plans in distinct architectural styles." },
        { step: "3", title: "Share as branded PDF", desc: "Download polished proposals with your company logo and send to clients." },
      ],
    },
    diff: {
      heading: "Why builders choose HomePlanAI",
      sub: "Everything you need to close more deals — nothing you don't.",
      items: [
        { icon: "🗺️", title: "Neighborhood Intelligence", desc: "Every plan includes nearby schools, safety scores, and live rental market data powered by Google Maps and RentCast." },
        { icon: "📄", title: "Instant Branded Proposals", desc: "Professional PDF output with your logo, ready to email or print in seconds. No design skills needed." },
        { icon: "🔗", title: "Client Sharing Portal", desc: "Send a unique link to your client. Get notified the moment they view it or expand a plan." },
      ],
    },
    testimonials: {
      heading: "What builders are saying",
      sub: "Trusted by home builders across the US",
      items: [
        { name: "James R.", role: "Custom Home Builder · Texas", text: "I used to spend hours sketching plans for client meetings. Now I walk in with 3 AI-generated proposals and close deals on the spot.", stars: 5 },
        { name: "Maria L.", role: "General Contractor · Florida", text: "The PDF output looks incredibly professional. My clients are always impressed. This tool paid for itself on the first deal.", stars: 5 },
        { name: "Kevin T.", role: "Home Builder · Arizona", text: "Super fast and easy. I generate plans during the client call itself. It's become my secret weapon for winning new projects.", stars: 5 },
      ],
    },
    pricing: {
      heading: "Simple, transparent pricing",
      sub: "Start free. Upgrade when you're ready.",
      free: {
        label: "Free",
        price: "$0",
        note: "No credit card required",
        features: ["3 floor plan generations / month", "PDF export included", "All room types", "Email support"],
        cta: "Get started free",
      },
      pro: {
        label: "Pro",
        price: "$49",
        period: "/mo",
        note: "14-day free trial · Cancel anytime",
        badge: "MOST POPULAR",
        features: ["Unlimited floor plan generations", "PDF with your logo", "Neighborhood & market data", "Client sharing portal", "Priority support"],
        cta: "Start 14-day free trial",
      },
      footer: "All plans include PDF export · No hidden fees · Cancel anytime",
    },
    ctaBanner: {
      heading: "Ready to close more deals?",
      sub: "Join home builders using AI floor plans to win clients before the competition.",
      cta: "Start Free — No Credit Card",
    },
    footer: "© 2026 HomePlanAI. Built for home builders.",
  },
  es: {
    nav: {
      how: "Cómo funciona",
      pricing: "Precios",
      reviews: "Reseñas",
      dashboard: "Panel",
      signin: "Iniciar sesión",
      cta: "Prueba Gratis",
    },
    hero: {
      badge: "Con IA · Para Constructores de Viviendas",
      headline1: "Cierra más contratos con ",
      headline2: "planos con IA",
      headline3: " en 30 segundos",
      sub: "Muestra a tus clientes su hogar soñado antes de que firmen. Sin arquitecto. Sin esperas.",
      ctaPrimary: "Genera Planos Gratis →",
      ctaSecondary: "Cómo funciona",
      stat1: { value: "30 seg", label: "para generar" },
      stat2: { value: "3 planos", label: "por sesión" },
      stat3: { value: "14 días", label: "de prueba" },
    },
    trust: {
      label: "Tecnología de líderes de la industria",
    },
    form: {
      title: "Genera tu primer plano — gratis",
      lotLabel: "Tamaño del terreno (pies²)",
      lotPlaceholder: "ej. 8500",
      budgetLabel: "Presupuesto (USD)",
      budgetPlaceholder: "ej. 350000",
      familyLabel: "Tamaño de la familia",
      familyPlaceholder: "Seleccionar…",
      familyOptions: ["1 persona", "2 personas", "3 personas", "4 personas", "5 personas", "6+ personas"],
      cityLabel: "Ciudad",
      cityPlaceholder: "ej. Austin",
      stateLabel: "Estado",
      statePlaceholder: "ej. TX",
      locationNote: "Opcional — agrega datos del vecindario y mercado",
      cta: "Generar 3 Planos →",
      generating: "Generando Planos…",
      disclaimer: "Sin tarjeta de crédito · 3 planos gratis incluidos",
    },
    pain: {
      heading: "¿Te suena familiar?",
      sub: "Estos son los tres mayores obstáculos para los constructores de viviendas hoy.",
      items: [
        { icon: "😟", title: "Los clientes no visualizan — y se van", desc: "Cuando los prospectos no pueden imaginarse su futura casa, posponen decisiones. \"Déjame pensarlo\" casi siempre significa un contrato perdido." },
        { icon: "💸", title: "Los arquitectos cobran $2,000+ y tardan semanas", desc: "Contratar un delineante para cada reunión no es sostenible. Estás gastando dinero y tiempo en prospectos que quizás nunca firman." },
        { icon: "📉", title: "Tu competencia muestra planos — tú pierdes contratos", desc: "Los constructores que llegan con propuestas visuales cierran más. Si no muestras planos, alguien más está ganando a tus clientes." },
      ],
    },
    how: {
      heading: "Cómo funciona",
      steps: [
        { step: "1", title: "Ingresa los datos del terreno", desc: "Proporciona el tamaño del lote, presupuesto y tamaño de familia. Toma 30 segundos." },
        { step: "2", title: "La IA genera 3 planos", desc: "Claude AI diseña tres planos optimizados en distintos estilos arquitectónicos." },
        { step: "3", title: "Comparte como PDF con tu marca", desc: "Descarga propuestas con tu logo y envíalas a tus clientes de inmediato." },
      ],
    },
    diff: {
      heading: "Por qué los constructores eligen HomePlanAI",
      sub: "Todo lo que necesitas para cerrar más contratos — nada que no necesites.",
      items: [
        { icon: "🗺️", title: "Inteligencia de Vecindario", desc: "Cada plano incluye escuelas cercanas, puntajes de seguridad y datos de renta del mercado vía Google Maps y RentCast." },
        { icon: "📄", title: "Propuestas Instantáneas", desc: "PDF profesional con tu logo, listo para enviar en segundos. Sin necesidad de diseño." },
        { icon: "🔗", title: "Portal para Clientes", desc: "Envía un enlace único a tu cliente. Recibe una notificación cuando lo vea o expanda un plano." },
      ],
    },
    testimonials: {
      heading: "Lo que dicen los constructores",
      sub: "Utilizado por constructores en todo Estados Unidos",
      items: [
        { name: "James R.", role: "Constructor de casas · Texas", text: "Solía pasar horas dibujando planos para las reuniones. Ahora entro con 3 propuestas generadas por IA y cierro contratos en el momento.", stars: 5 },
        { name: "Maria L.", role: "Contratista General · Florida", text: "El PDF se ve increíblemente profesional. Mis clientes siempre quedan impresionados. Esta herramienta se pagó sola en el primer contrato.", stars: 5 },
        { name: "Kevin T.", role: "Constructor de casas · Arizona", text: "Rápido y fácil. Genero planos durante la llamada con el cliente. Se ha convertido en mi arma secreta para ganar nuevos proyectos.", stars: 5 },
      ],
    },
    pricing: {
      heading: "Precios simples y transparentes",
      sub: "Empieza gratis. Actualiza cuando estés listo.",
      free: {
        label: "Gratis",
        price: "$0",
        note: "Sin tarjeta de crédito",
        features: ["3 generaciones de planos / mes", "Exportación PDF incluida", "Todos los tipos de habitación", "Soporte por email"],
        cta: "Empezar gratis",
      },
      pro: {
        label: "Pro",
        price: "$49",
        period: "/mes",
        note: "14 días de prueba gratis · Cancela cuando quieras",
        badge: "MÁS POPULAR",
        features: ["Generaciones ilimitadas", "PDF con tu logo", "Datos de vecindario y mercado", "Portal para clientes", "Soporte prioritario"],
        cta: "Iniciar prueba gratis de 14 días",
      },
      footer: "Todos los planes incluyen PDF · Sin costos ocultos · Cancela cuando quieras",
    },
    ctaBanner: {
      heading: "¿Listo para cerrar más contratos?",
      sub: "Únete a los constructores que usan planos con IA para ganar clientes.",
      cta: "Empieza Gratis — Sin Tarjeta",
    },
    footer: "© 2026 HomePlanAI. Construido para constructores de viviendas.",
  },
} as const;

type Lang = keyof typeof TRANSLATIONS;

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${className ?? ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Mock UI Demo ──────────────────────────────────────────────────────
function DemoUI() {
  return (
    <div className="relative mx-auto max-w-3xl">
      {/* Window chrome */}
      <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 border-b border-slate-700">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-3 text-xs text-slate-400 font-mono">homeplan-ai.vercel.app/results</span>
        </div>
        {/* Demo content */}
        <div className="p-5 bg-slate-50">
          {/* Header bar */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <span className="text-sm font-bold text-slate-800">HomePlan<span className="text-blue-500">AI</span></span>
            <div className="flex gap-2">
              <div className="h-7 w-24 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                <span className="text-xs text-emerald-700 font-medium">Share Link</span>
              </div>
              <div className="h-7 w-24 rounded-lg bg-blue-500 flex items-center justify-center">
                <span className="text-xs text-white font-medium">Export PDF</span>
              </div>
            </div>
          </div>
          {/* 3 plan cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Plan 1", name: "Craftsman Ranch", sqft: "2,100", cost: "$315K", color: "blue" },
              { label: "Plan 2", name: "Modern Farmhouse", sqft: "2,350", cost: "$352K", color: "emerald", selected: true },
              { label: "Plan 3", name: "Contemporary", sqft: "1,980", cost: "$297K", color: "violet" },
            ].map((p) => (
              <div key={p.label} className={`rounded-xl border-2 overflow-hidden bg-white transition-all ${p.selected ? "border-emerald-400 shadow-lg scale-[1.02]" : "border-slate-200"}`}>
                <div className={`px-3 py-2 text-xs font-bold text-white ${p.color === "blue" ? "bg-blue-500" : p.color === "emerald" ? "bg-emerald-500" : "bg-violet-500"}`}>
                  {p.label}
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold text-slate-800 leading-tight">{p.name}</p>
                  <p className="text-lg font-extrabold text-slate-900 mt-1">{p.cost}</p>
                  <p className="text-xs text-slate-400">{p.sqft} sq ft</p>
                  <div className={`mt-2 h-1.5 rounded-full ${p.selected ? "bg-emerald-400" : "bg-slate-200"}`} />
                </div>
              </div>
            ))}
          </div>
          {/* Neighborhood row */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
              <span className="text-base">🏫</span>
              <div>
                <p className="text-xs font-semibold text-slate-700">3 Schools</p>
                <p className="text-xs text-slate-400">0.8–2.1 km</p>
              </div>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center gap-2">
              <span className="text-base">🛡️</span>
              <div>
                <p className="text-xs font-semibold text-slate-700">Safety 8/10</p>
                <p className="text-xs text-slate-400">High coverage</p>
              </div>
            </div>
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 flex items-center gap-2">
              <span className="text-base">📊</span>
              <div>
                <p className="text-xs font-semibold text-slate-700">$1,850/mo</p>
                <p className="text-xs text-slate-400">Avg rent</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Glow */}
      <div className="absolute -inset-4 bg-blue-500/10 rounded-3xl blur-2xl -z-10" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ lotSize: "", budget: "", familySize: "", city: "", state: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  const t = TRANSLATIONS[lang];
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 429 && data.code === "LIMIT_EXCEEDED") {
        router.push(`/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      sessionStorage.setItem("floorPlans", JSON.stringify(data.plans));
      sessionStorage.setItem("formData", JSON.stringify(form));
      if (form.city && form.state) {
        sessionStorage.setItem("location", JSON.stringify({ city: form.city, state: form.state }));
      } else {
        sessionStorage.removeItem("location");
      }
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plans");
      setLoading(false);
    }
  }

  const isValid = form.lotSize && form.budget && form.familySize;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">

      {/* ── 1. Nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          {/* Logo */}
          <a href="/" className="text-xl font-extrabold tracking-tight text-white shrink-0">
            HomePlan<span className="text-blue-400">AI</span>
          </a>

          {/* Center nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#how" className="hover:text-white transition-colors">{t.nav.how}</a>
            <a href="#pricing" className="hover:text-white transition-colors">{t.nav.pricing}</a>
            <a href="#testimonials" className="hover:text-white transition-colors">{t.nav.reviews}</a>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:border-blue-400 hover:text-blue-400 transition-colors"
            >
              <span className="text-base leading-none">{lang === "en" ? "🇲🇽" : "🇺🇸"}</span>
              {lang === "en" ? "ES" : "EN"}
            </button>
            {userEmail ? (
              <a href="/dashboard" className="hidden sm:block text-sm text-slate-300 hover:text-white transition-colors">
                {t.nav.dashboard}
              </a>
            ) : (
              <a href="/login" className="hidden sm:block text-sm text-slate-300 hover:text-white transition-colors">
                {t.nav.signin}
              </a>
            )}
            <a
              href="#generate"
              className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              {t.nav.cta}
            </a>
          </div>
        </div>
      </header>

      {/* ── 2. Hero ──────────────────────────────────────────────────── */}
      <section className="bg-slate-900 pt-20 pb-28 px-6 text-center relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #3b82f6 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-900/80" />

        <div className="relative max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-xs font-semibold tracking-widest text-blue-300 uppercase bg-blue-500/10 rounded-full border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {t.hero.badge}
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight text-white mb-6">
            {t.hero.headline1}
            <span className="text-blue-400">{t.hero.headline2}</span>
            {t.hero.headline3}
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            {t.hero.sub}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="#generate"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-500 text-white text-lg font-bold hover:bg-blue-600 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30"
            >
              {t.hero.ctaPrimary}
            </a>
            <a
              href="#how"
              className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-slate-600 text-slate-200 text-lg font-semibold hover:border-slate-400 hover:text-white transition-all"
            >
              {t.hero.ctaSecondary}
            </a>
          </div>

          {/* Stats badges */}
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {[t.hero.stat1, t.hero.stat2, t.hero.stat3].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-white">{stat.value}</span>
                <span className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Trust Badges ─────────────────────────────────────────── */}
      <section className="bg-slate-800 py-6 px-6 border-y border-slate-700">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest shrink-0">{t.trust.label}</span>
          <div className="flex items-center gap-8 flex-wrap justify-center">
            {[
              { name: "Google Maps", icon: "🗺️", color: "text-blue-400" },
              { name: "RentCast", icon: "📊", color: "text-emerald-400" },
              { name: "Anthropic Claude", icon: "✦", color: "text-violet-400" },
            ].map((tech) => (
              <div key={tech.name} className="flex items-center gap-2">
                <span className={`text-lg ${tech.color}`}>{tech.icon}</span>
                <span className="text-sm font-semibold text-slate-300">{tech.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Generate Form ────────────────────────────────────────────── */}
      <section id="generate" className="py-16 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest text-center mb-4">{t.form.title}</p>
          <form
            onSubmit={handleSubmit}
            className="bg-white border-2 border-slate-200 rounded-2xl shadow-xl p-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.form.lotLabel}</label>
                <input type="number" name="lotSize" value={form.lotSize} onChange={handleChange}
                  placeholder={t.form.lotPlaceholder} min={1000} required
                  className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-500 transition text-sm" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.form.budgetLabel}</label>
                <input type="number" name="budget" value={form.budget} onChange={handleChange}
                  placeholder={t.form.budgetPlaceholder} min={50000} required
                  className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-500 transition text-sm" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.form.familyLabel}</label>
                <select name="familySize" value={form.familySize} onChange={handleChange} required
                  className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 focus:outline-none focus:border-blue-500 transition text-sm bg-white">
                  <option value="">{t.form.familyPlaceholder}</option>
                  {t.form.familyOptions.map((opt, i) => (
                    <option key={i} value={String(i + 1)}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional location */}
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-2">{t.form.locationNote}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{t.form.cityLabel}</label>
                  <input type="text" name="city" value={form.city} onChange={handleChange}
                    placeholder={t.form.cityPlaceholder} maxLength={60}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{t.form.stateLabel}</label>
                  <input type="text" name="state" value={form.state} onChange={handleChange}
                    placeholder={t.form.statePlaceholder} maxLength={30}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm" />
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{error}</p>
            )}

            <button type="submit" disabled={!isValid || loading}
              className="mt-6 w-full py-4 rounded-xl bg-blue-500 text-white text-base font-bold hover:bg-blue-600 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
              {loading ? <><Spinner />{t.form.generating}</> : t.form.cta}
            </button>
          </form>
          <p className="mt-4 text-xs text-center text-slate-400">{t.form.disclaimer}</p>
        </div>
      </section>

      {/* ── 4. Pain Points ──────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{t.pain.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.pain.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.pain.items.map((item) => (
              <div key={item.title} className="bg-white border-2 border-red-100 rounded-2xl p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                <span className="text-4xl">{item.icon}</span>
                <h3 className="font-bold text-slate-900 text-base leading-snug">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-xl">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-semibold">
                {lang === "en" ? "HomePlanAI solves all three — in 30 seconds." : "HomePlanAI resuelve los tres — en 30 segundos."}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Feature Demo ─────────────────────────────────────────── */}
      <section id="how" className="py-20 px-6 bg-slate-900 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">{t.how.heading}</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8">
              {t.how.steps.map((step, i) => (
                <div key={step.step} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/30">
                    {step.step}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">{step.title}</p>
                    <p className="text-xs text-slate-400 max-w-[160px]">{step.desc}</p>
                  </div>
                  {i < t.how.steps.length - 1 && (
                    <svg className="hidden sm:block w-5 h-5 text-slate-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DemoUI />
        </div>
      </section>

      {/* ── 6. Differentiators ──────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{t.diff.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.diff.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.diff.items.map((item) => (
              <div key={item.title} className="flex flex-col gap-4 p-7 rounded-2xl border-2 border-slate-100 hover:border-blue-100 hover:shadow-md transition-all bg-slate-50">
                <span className="text-4xl">{item.icon}</span>
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{t.pricing.heading}</h2>
            <p className="text-slate-500">{t.pricing.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 flex flex-col gap-5">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.pricing.free.label}</p>
                <p className="text-5xl font-extrabold text-slate-900 mt-2">{t.pricing.free.price}</p>
                <p className="text-sm text-slate-400 mt-1">{t.pricing.free.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.free.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Check className="text-emerald-500" />{f}
                  </li>
                ))}
              </ul>
              <a href="/login" className="block text-center py-3.5 rounded-xl border-2 border-slate-800 text-slate-800 font-bold hover:bg-slate-800 hover:text-white transition-all">
                {t.pricing.free.cta}
              </a>
            </div>

            {/* Pro */}
            <div className="bg-slate-900 rounded-2xl p-8 flex flex-col gap-5 relative overflow-hidden shadow-2xl shadow-slate-900/30">
              <div className="absolute top-5 right-5 bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {t.pricing.pro.badge}
              </div>
              <div>
                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">{t.pricing.pro.label}</p>
                <p className="text-5xl font-extrabold text-white mt-2">
                  {t.pricing.pro.price}<span className="text-lg font-medium text-slate-400">{t.pricing.pro.period}</span>
                </p>
                <p className="text-sm text-slate-400 mt-1">{t.pricing.pro.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.pro.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-200">
                    <Check className="text-emerald-400" />{f}
                  </li>
                ))}
              </ul>
              <a href="/login" className="block text-center py-3.5 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30">
                {t.pricing.pro.cta}
              </a>
            </div>
          </div>
          <p className="mt-8 text-sm text-center text-slate-400">{t.pricing.footer}</p>
        </div>
      </section>

      {/* ── 8. Testimonials ─────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{t.testimonials.heading}</h2>
            <p className="text-slate-500">{t.testimonials.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.testimonials.items.map((item) => (
              <div key={item.name} className="bg-slate-50 rounded-2xl p-7 flex flex-col gap-4 border-2 border-slate-100 hover:border-blue-100 hover:shadow-md transition-all">
                <Stars count={item.stars} />
                <p className="text-slate-600 text-sm leading-relaxed flex-1">"{item.text}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {item.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. CTA Banner ───────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #3b82f6 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-5">{t.ctaBanner.heading}</h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">{t.ctaBanner.sub}</p>
          <a
            href="#generate"
            className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-blue-500 text-white text-xl font-bold hover:bg-blue-600 active:scale-[0.98] transition-all shadow-2xl shadow-blue-500/30"
          >
            {t.ctaBanner.cta}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </section>

      {/* ── 10. Footer ──────────────────────────────────────────────── */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-lg font-extrabold text-white">
            HomePlan<span className="text-blue-400">AI</span>
          </span>
          <p className="text-sm text-slate-500">{t.footer}</p>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <a href="#pricing" className="hover:text-slate-300 transition-colors">{t.nav.pricing}</a>
            <a href="/login" className="hover:text-slate-300 transition-colors">{t.nav.signin}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
