"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── i18n ─────────────────────────────────────────────────────────────
const T = {
  en: {
    nav: { how: "How it works", pricing: "Pricing", reviews: "Reviews", dashboard: "Dashboard", signin: "Sign in", cta: "Start Free Trial" },
    hero: {
      badge: "Launching on ProductHunt · May 26",
      headline1: "Close deals faster with",
      headline2: "AI-generated floor plans",
      sub: "Show clients their dream home in 30 seconds — before they sign. Powered by Claude AI. No architect needed.",
      ctaPrimary: "Generate Plans Free →",
      ctaSecondary: "Watch demo",
      stat1: { value: "30 sec", label: "to generate" },
      stat2: { value: "3 plans", label: "per session" },
      stat3: { value: "14-day", label: "free trial" },
    },
    trust: { label: "Powered by" },
    form: {
      title: "Generate your first floor plan — free",
      lotLabel: "Lot Size (sq ft)", lotPlaceholder: "e.g. 8500",
      budgetLabel: "Budget (USD)", budgetPlaceholder: "e.g. 350000",
      familyLabel: "Family Size", familyPlaceholder: "Select…",
      familyOptions: ["1 person", "2 people", "3 people", "4 people", "5 people", "6+ people"],
      cityLabel: "City", cityPlaceholder: "e.g. Austin",
      stateLabel: "State", statePlaceholder: "e.g. TX",
      locationNote: "Optional — adds neighborhood & market data",
      cta: "Generate 3 Plans →", generating: "Generating Plans…",
      disclaimer: "No credit card required · 3 free plans included",
    },
    pain: {
      heading: "Sound familiar?",
      sub: "The three biggest deal-killers for home builders today.",
      items: [
        { icon: "😟", title: "Clients can't visualize — and walk away", desc: "When prospects can't picture their future home, they delay decisions. \"Let me think about it\" almost always means a lost deal." },
        { icon: "💸", title: "Architects cost $2,000+ and take weeks", desc: "Hiring a draftsman for every prospect meeting isn't scalable. You're burning money and time on leads that may never convert." },
        { icon: "📉", title: "Competitors show plans — you're losing deals", desc: "Builders who walk into meetings with visual proposals close more. If you're not showing plans, someone else is winning your clients." },
      ],
    },
    how: {
      heading: "From lot size to signed client — in minutes",
      steps: [
        { step: "01", title: "Enter lot details", desc: "Lot size, budget, family size. Optional: city & state for neighborhood data.", icon: "📋" },
        { step: "02", title: "AI generates 3 plans", desc: "Claude AI creates three architecturally distinct floor plans, each sized to your budget.", icon: "✨" },
        { step: "03", title: "Share with your client", desc: "Download a branded PDF or send a unique link. Get notified when they view it.", icon: "🔗" },
      ],
    },
    diff: {
      heading: "Built for builders. Not architects.",
      sub: "HomePlanAI is a sales tool — not a design tool.",
      items: [
        { icon: "🗺️", title: "Neighborhood Intelligence", desc: "Auto-fetch nearby schools, safety data, and market rents via Google Maps and RentCast." },
        { icon: "📄", title: "Branded PDF in One Click", desc: "Professional proposals with your logo, room breakdown, and cost estimate. Print-ready." },
        { icon: "📡", title: "Real-Time Client Tracking", desc: "Know the moment your client opens the plan link. See which plan they spent time on." },
      ],
    },
    testimonials: {
      heading: "Builders close faster with HomePlanAI",
      sub: "Trusted across the US",
      items: [
        { name: "James R.", role: "Custom Home Builder · Texas", text: "I used to spend hours sketching plans for client meetings. Now I walk in with 3 AI-generated proposals and close deals on the spot.", stars: 5 },
        { name: "Maria L.", role: "General Contractor · Florida", text: "The PDF output looks incredibly professional. My clients are always impressed. This tool paid for itself on the first deal.", stars: 5 },
        { name: "Kevin T.", role: "Home Builder · Arizona", text: "Super fast and easy. I generate plans during the client call itself. It's become my secret weapon for winning new projects.", stars: 5 },
      ],
    },
    pricing: {
      heading: "Simple, transparent pricing",
      sub: "Start free. Upgrade when you're ready.",
      free: { label: "Free", price: "$0", note: "No credit card required", features: ["3 floor plan generations / month", "PDF export included", "All room types", "Email support"], cta: "Get started free" },
      pro: { label: "Pro", price: "$49", period: "/mo", note: "14-day free trial · Cancel anytime", badge: "MOST POPULAR", features: ["Unlimited floor plan generations", "Branded PDF with your logo", "Neighborhood & market data", "Client sharing portal + tracking", "Priority support"], cta: "Start 14-day free trial" },
      footer: "All plans include PDF export · No hidden fees · Cancel anytime",
    },
    ctaBanner: { heading: "Ready to close more deals?", sub: "Join home builders using AI floor plans to win clients before the competition.", cta: "Start Free — No Credit Card" },
    footer: "© 2026 HomePlanAI. Built for home builders.",
  },
  es: {
    nav: { how: "Cómo funciona", pricing: "Precios", reviews: "Reseñas", dashboard: "Panel", signin: "Iniciar sesión", cta: "Prueba Gratis" },
    hero: {
      badge: "Lanzamiento en ProductHunt · 26 de mayo",
      headline1: "Cierra contratos más rápido con",
      headline2: "planos generados por IA",
      sub: "Muestra a tus clientes su hogar soñado en 30 segundos — antes de que firmen. Sin arquitecto.",
      ctaPrimary: "Genera Planos Gratis →",
      ctaSecondary: "Ver demo",
      stat1: { value: "30 seg", label: "para generar" },
      stat2: { value: "3 planos", label: "por sesión" },
      stat3: { value: "14 días", label: "de prueba" },
    },
    trust: { label: "Con tecnología de" },
    form: {
      title: "Genera tu primer plano — gratis",
      lotLabel: "Tamaño del terreno (pies²)", lotPlaceholder: "ej. 8500",
      budgetLabel: "Presupuesto (USD)", budgetPlaceholder: "ej. 350000",
      familyLabel: "Tamaño de la familia", familyPlaceholder: "Seleccionar…",
      familyOptions: ["1 persona", "2 personas", "3 personas", "4 personas", "5 personas", "6+ personas"],
      cityLabel: "Ciudad", cityPlaceholder: "ej. Austin",
      stateLabel: "Estado", statePlaceholder: "ej. TX",
      locationNote: "Opcional — agrega datos del vecindario y mercado",
      cta: "Generar 3 Planos →", generating: "Generando Planos…",
      disclaimer: "Sin tarjeta de crédito · 3 planos gratis incluidos",
    },
    pain: {
      heading: "¿Te suena familiar?",
      sub: "Los tres mayores obstáculos para los constructores hoy.",
      items: [
        { icon: "😟", title: "Los clientes no visualizan — y se van", desc: "Cuando los prospectos no pueden imaginarse su futura casa, posponen decisiones. Casi siempre significa un contrato perdido." },
        { icon: "💸", title: "Los arquitectos cobran $2,000+ y tardan semanas", desc: "Contratar un delineante para cada reunión no es sostenible. Estás gastando dinero y tiempo en prospectos que quizás nunca firman." },
        { icon: "📉", title: "Tu competencia muestra planos — tú pierdes", desc: "Los constructores que llegan con propuestas visuales cierran más. Si no muestras planos, alguien más está ganando a tus clientes." },
      ],
    },
    how: {
      heading: "Del lote al contrato firmado — en minutos",
      steps: [
        { step: "01", title: "Ingresa los datos del lote", desc: "Tamaño, presupuesto, familia. Opcional: ciudad y estado para datos del vecindario.", icon: "📋" },
        { step: "02", title: "La IA genera 3 planos", desc: "Claude AI crea tres planos arquitectónicamente distintos, cada uno ajustado a tu presupuesto.", icon: "✨" },
        { step: "03", title: "Comparte con tu cliente", desc: "Descarga el PDF o envía un enlace único. Recibe una notificación cuando lo vean.", icon: "🔗" },
      ],
    },
    diff: {
      heading: "Hecho para constructores. No para arquitectos.",
      sub: "HomePlanAI es una herramienta de ventas — no de diseño.",
      items: [
        { icon: "🗺️", title: "Inteligencia de Vecindario", desc: "Escuelas, seguridad y renta del mercado vía Google Maps y RentCast." },
        { icon: "📄", title: "PDF con Tu Marca en Un Clic", desc: "Propuestas profesionales con tu logo, distribución de habitaciones y estimado de costo." },
        { icon: "📡", title: "Seguimiento en Tiempo Real", desc: "Sabe al instante cuando tu cliente abre el enlace y qué plano le interesa más." },
      ],
    },
    testimonials: {
      heading: "Constructores cierran más con HomePlanAI",
      sub: "Utilizado en todo Estados Unidos",
      items: [
        { name: "James R.", role: "Constructor de casas · Texas", text: "Solía pasar horas dibujando planos. Ahora entro con 3 propuestas generadas por IA y cierro contratos en el momento.", stars: 5 },
        { name: "Maria L.", role: "Contratista General · Florida", text: "El PDF se ve increíblemente profesional. Mis clientes siempre quedan impresionados. Se pagó solo en el primer contrato.", stars: 5 },
        { name: "Kevin T.", role: "Constructor de casas · Arizona", text: "Rápido y fácil. Genero planos durante la llamada con el cliente. Se ha convertido en mi arma secreta.", stars: 5 },
      ],
    },
    pricing: {
      heading: "Precios simples y transparentes",
      sub: "Empieza gratis. Actualiza cuando estés listo.",
      free: { label: "Gratis", price: "$0", note: "Sin tarjeta de crédito", features: ["3 generaciones / mes", "Exportación PDF incluida", "Todos los tipos de habitación", "Soporte por email"], cta: "Empezar gratis" },
      pro: { label: "Pro", price: "$49", period: "/mes", note: "14 días de prueba · Cancela cuando quieras", badge: "MÁS POPULAR", features: ["Generaciones ilimitadas", "PDF con tu logo", "Datos de vecindario y mercado", "Portal para clientes + seguimiento", "Soporte prioritario"], cta: "Iniciar prueba gratis" },
      footer: "Todos los planes incluyen PDF · Sin costos ocultos · Cancela cuando quieras",
    },
    ctaBanner: { heading: "¿Listo para cerrar más contratos?", sub: "Únete a los constructores que usan planos con IA para ganar clientes.", cta: "Empieza Gratis — Sin Tarjeta" },
    footer: "© 2026 HomePlanAI. Construido para constructores.",
  },
} as const;

type Lang = keyof typeof T;

// ── Micro-components ─────────────────────────────────────────────────
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
        <svg key={i} className="w-4 h-4 fill-amber-400" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function Check() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Hero product preview (right panel) ───────────────────────────────
function HeroPreview() {
  return (
    <div className="relative w-full max-w-lg mx-auto lg:mx-0">
      {/* Glow */}
      <div className="absolute -inset-6 bg-blue-500/20 rounded-3xl blur-3xl" />
      {/* Window */}
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-900/80 border-b border-slate-700">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-xs text-slate-500 font-mono">homeplan-ai.vercel.app/results</span>
        </div>
        <div className="p-4 bg-slate-50">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold text-slate-800">HomePlan<span className="text-blue-500">AI</span></span>
            <div className="flex gap-1.5">
              <span className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">Share Link ✓</span>
              <span className="px-2 py-1 rounded text-xs bg-blue-500 text-white font-semibold">PDF</span>
            </div>
          </div>
          {/* Plan cards */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { id: "01", name: "Craftsman Ranch", sqft: "2,100 sqft", cost: "$315K", bd: "3bd/2ba", color: "blue", selected: false },
              { id: "02", name: "Modern Farmhouse", sqft: "2,350 sqft", cost: "$352K", bd: "4bd/2.5ba", color: "emerald", selected: true },
              { id: "03", name: "Contemporary", sqft: "1,980 sqft", cost: "$297K", bd: "3bd/2ba", color: "violet", selected: false },
            ].map(p => (
              <div key={p.id} className={`rounded-xl border-2 bg-white overflow-hidden ${p.selected ? "border-emerald-400 shadow-md" : "border-slate-200"}`}>
                <div className={`px-2 py-1.5 text-white text-xs font-bold ${p.color === "blue" ? "bg-blue-500" : p.color === "emerald" ? "bg-emerald-500" : "bg-violet-500"}`}>
                  Plan {p.id} {p.selected && "✓"}
                </div>
                <div className="p-2">
                  <p className="text-xs font-bold text-slate-800 leading-tight truncate">{p.name}</p>
                  <p className="text-sm font-extrabold text-slate-900 mt-0.5">{p.cost}</p>
                  <p className="text-xs text-slate-400">{p.sqft}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.bd}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Neighborhood strip */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 flex items-center gap-1.5">
              <span className="text-sm">🏫</span>
              <div><p className="text-xs font-semibold text-slate-700">Schools</p><p className="text-xs text-slate-400">★ 8.4/10</p></div>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 flex items-center gap-1.5">
              <span className="text-sm">🛡️</span>
              <div><p className="text-xs font-semibold text-slate-700">Safety</p><p className="text-xs text-slate-400">High</p></div>
            </div>
            <div className="rounded-lg bg-violet-50 border border-violet-100 p-2 flex items-center gap-1.5">
              <span className="text-sm">📊</span>
              <div><p className="text-xs font-semibold text-slate-700">Avg Rent</p><p className="text-xs text-slate-400">$1,850/mo</p></div>
            </div>
          </div>
          {/* Mortgage strip */}
          <div className="mt-2 rounded-lg bg-slate-800 p-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-400">Mortgage (20% down, 30yr, 7%)</span>
            <span className="text-sm font-extrabold text-white">$1,876<span className="text-slate-400 text-xs font-normal">/mo</span></span>
          </div>
        </div>
      </div>
      {/* Floating notification */}
      <div className="absolute -bottom-3 -right-3 bg-white rounded-xl shadow-xl border border-slate-100 px-3 py-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-semibold text-slate-700">Client viewed plan</span>
        <span className="text-xs text-slate-400">just now</span>
      </div>
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

  const t = T[lang];
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 429 && data.code === "LIMIT_EXCEEDED") {
        router.push(`/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`); return;
      }
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      sessionStorage.setItem("floorPlans", JSON.stringify(data.plans));
      sessionStorage.setItem("formData", JSON.stringify(form));
      if (form.city && form.state) sessionStorage.setItem("location", JSON.stringify({ city: form.city, state: form.state }));
      else sessionStorage.removeItem("location");
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plans");
      setLoading(false);
    }
  }

  const isValid = form.lotSize && form.budget && form.familySize;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#F8FAFC", color: "#1E293B" }}>

      {/* ── 1. Nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60" style={{ background: "#0F172A" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <a href="/" className="text-xl font-extrabold tracking-tight text-white shrink-0">
            HomePlan<span className="text-blue-400">AI</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <a href="#how" className="hover:text-white transition-colors">{t.nav.how}</a>
            <a href="#pricing" className="hover:text-white transition-colors">{t.nav.pricing}</a>
            <a href="#reviews" className="hover:text-white transition-colors">{t.nav.reviews}</a>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
              <span className="text-base leading-none">{lang === "en" ? "🇲🇽" : "🇺🇸"}</span>
              {lang === "en" ? "ES" : "EN"}
            </button>
            {userEmail ? (
              <a href="/dashboard" className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.dashboard}</a>
            ) : (
              <a href="/login" className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.signin}</a>
            )}
            <a href="#generate" className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors" style={{ background: "#3B82F6" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2563EB")}
              onMouseLeave={e => (e.currentTarget.style.background = "#3B82F6")}
            >{t.nav.cta}</a>
          </div>
        </div>
      </header>

      {/* ── 2. Hero ──────────────────────────────────────────────────── */}
      <section style={{ background: "#0F172A" }} className="relative overflow-hidden">
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        {/* Radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            {/* Left: copy */}
            <div className="flex-1 text-center lg:text-left max-w-xl mx-auto lg:mx-0">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-bold tracking-widest text-blue-300 uppercase bg-blue-500/10 rounded-full border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {t.hero.badge}
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-white mb-5">
                {t.hero.headline1}{" "}
                <span className="text-blue-400">{t.hero.headline2}</span>
              </h1>
              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-lg">{t.hero.sub}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-10">
                <a href="#generate" className="px-7 py-4 rounded-xl text-white font-bold text-base shadow-lg transition-all"
                  style={{ background: "#3B82F6", boxShadow: "0 0 30px rgba(59,130,246,0.35)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#2563EB")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#3B82F6")}
                >{t.hero.ctaPrimary}</a>
                <a href="#how" className="px-7 py-4 rounded-xl font-semibold text-base border-2 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-all">
                  {t.hero.ctaSecondary}
                </a>
              </div>
              {/* Stats */}
              <div className="flex items-center gap-8 justify-center lg:justify-start">
                {[t.hero.stat1, t.hero.stat2, t.hero.stat3].map((s, i) => (
                  <div key={i} className="text-center lg:text-left">
                    <p className="text-2xl font-extrabold text-white">{s.value}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Right: product preview */}
            <div className="flex-1 w-full lg:max-w-lg">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Trust Bar ────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 py-5 px-6" style={{ background: "#fff" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-5 justify-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">{t.trust.label}</span>
          <div className="w-px h-4 bg-slate-200 hidden sm:block" />
          <div className="flex flex-wrap items-center justify-center gap-8">
            {[
              { name: "Google Maps", icon: "🗺️", sub: "Places & Geocoding" },
              { name: "RentCast", icon: "📊", sub: "Market Data" },
              { name: "Anthropic Claude", icon: "✦", sub: "AI Generation" },
              { name: "Stripe", icon: "💳", sub: "Payments" },
              { name: "Supabase", icon: "🗄️", sub: "Database" },
            ].map(tech => (
              <div key={tech.name} className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                <span className="text-lg">{tech.icon}</span>
                <div>
                  <p className="text-sm font-bold text-slate-700 leading-none">{tech.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{tech.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Generate Form ────────────────────────────────────────────── */}
      <section id="generate" className="py-16 px-6" style={{ background: "#F8FAFC" }}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.form.title}</p>
          </div>
          <form onSubmit={handleSubmit} className="bg-white border-2 border-slate-200 rounded-2xl shadow-xl p-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { label: t.form.lotLabel, name: "lotSize", type: "number", placeholder: t.form.lotPlaceholder, min: 1000 },
                { label: t.form.budgetLabel, name: "budget", type: "number", placeholder: t.form.budgetPlaceholder, min: 50000 },
              ].map(f => (
                <div key={f.name} className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{f.label}</label>
                  <input type={f.type} name={f.name} value={form[f.name as "lotSize" | "budget"]}
                    onChange={handleChange} placeholder={f.placeholder} min={f.min} required
                    className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.form.familyLabel}</label>
                <select name="familySize" value={form.familySize} onChange={handleChange} required
                  className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 focus:outline-none focus:border-blue-500 transition text-sm bg-white">
                  <option value="">{t.form.familyPlaceholder}</option>
                  {t.form.familyOptions.map((opt, i) => <option key={i} value={String(i + 1)}>{opt}</option>)}
                </select>
              </div>
            </div>
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
            {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{error}</p>}
            <button type="submit" disabled={!isValid || loading}
              className="mt-6 w-full py-4 rounded-xl text-white text-base font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              style={{ background: isValid && !loading ? "#3B82F6" : undefined }}>
              {loading ? <><Spinner />{t.form.generating}</> : t.form.cta}
            </button>
          </form>
          <p className="mt-4 text-xs text-center text-slate-400">{t.form.disclaimer}</p>
        </div>
      </section>

      {/* ── 4. Pain Points ──────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ color: "#0F172A" }}>{t.pain.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.pain.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.pain.items.map(item => (
              <div key={item.title} className="rounded-2xl p-7 border-2 border-red-100 hover:border-red-200 hover:shadow-md transition-all" style={{ background: "#fff8f8" }}>
                <span className="text-4xl block mb-4">{item.icon}</span>
                <h3 className="font-bold text-slate-900 text-base leading-snug mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 text-white px-8 py-4 rounded-2xl shadow-xl" style={{ background: "#0F172A" }}>
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

      {/* ── 5. How it Works / Feature Demo ──────────────────────────── */}
      <section id="how" className="py-20 px-6" style={{ background: "#0F172A" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">{t.how.heading}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
            {t.how.steps.map((step, i) => (
              <div key={step.step} className="relative">
                {i < t.how.steps.length - 1 && (
                  <div className="hidden sm:block absolute top-8 left-full w-full h-px border-t-2 border-dashed border-slate-700 z-0" style={{ width: "calc(100% - 48px)", left: "calc(100% - 12px)" }} />
                )}
                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-extrabold text-white border border-blue-500/40" style={{ background: "rgba(59,130,246,0.15)" }}>
                      {step.icon}
                    </div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">{step.step}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base mb-1">{step.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Inline demo UI */}
          <div className="relative mx-auto max-w-3xl">
            <div className="absolute -inset-4 bg-blue-500/10 rounded-3xl blur-2xl" />
            <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-900 border-b border-slate-700">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <div className="ml-3 flex-1 bg-slate-800 rounded px-3 py-1">
                  <span className="text-xs text-slate-500 font-mono">homeplan-ai.vercel.app/results</span>
                </div>
              </div>
              <div className="p-5 bg-slate-50">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-slate-800">HomePlan<span className="text-blue-500">AI</span></span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">8,500 sqft · $450K · 4 people · Austin, TX</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">Share Link</button>
                    <button className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: "#3B82F6" }}>Export PDF</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Plan 1", name: "Craftsman Ranch", sqft: "2,100", bd: "3bd/2ba", cost: "$315K", color: "#3B82F6", sel: false },
                    { label: "Plan 2", name: "Modern Farmhouse", sqft: "2,350", bd: "4bd/2.5ba", cost: "$352K", color: "#10B981", sel: true },
                    { label: "Plan 3", name: "Contemporary", sqft: "1,980", bd: "3bd/2ba", cost: "$297K", color: "#8B5CF6", sel: false },
                  ].map(p => (
                    <div key={p.label} className={`rounded-xl bg-white border-2 overflow-hidden shadow-sm ${p.sel ? "shadow-emerald-100" : ""}`} style={{ borderColor: p.sel ? p.color : "#e2e8f0" }}>
                      <div className="px-3 py-2 text-xs font-bold text-white" style={{ background: p.color }}>{p.label} {p.sel && "★ Selected"}</div>
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                        <p className="text-base font-extrabold text-slate-900 mt-0.5">{p.cost}</p>
                        <p className="text-xs text-slate-400">{p.sqft} sq ft · {p.bd}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full" style={{ width: p.sel ? "100%" : "60%", background: p.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { icon: "🏫", label: "Schools", val: "★ 8.4/10", bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
                    { icon: "🛡️", label: "Safety", val: "High", bg: "#F0FDF4", border: "#BBF7D0", text: "#15803D" },
                    { icon: "🛒", label: "Grocery", val: "0.5 km", bg: "#FAF5FF", border: "#E9D5FF", text: "#6B21A8" },
                    { icon: "📊", label: "Avg Rent", val: "$1,850/mo", bg: "#F8FAFC", border: "#CBD5E1", text: "#334155" },
                  ].map(n => (
                    <div key={n.label} className="rounded-lg p-2.5 flex items-center gap-2 border" style={{ background: n.bg, borderColor: n.border }}>
                      <span className="text-base shrink-0">{n.icon}</span>
                      <div>
                        <p className="text-xs font-bold leading-none" style={{ color: n.text }}>{n.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: n.text }}>{n.val}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl p-3 flex items-center justify-between border border-slate-200 bg-white">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>🏦</span> Mortgage est. <span className="font-semibold text-slate-800">$1,876/mo</span>
                    <span className="text-xs text-slate-400">(20% down · 30yr · 7%)</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full text-emerald-700 font-semibold" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Differentiators ──────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ color: "#0F172A" }}>{t.diff.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.diff.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.diff.items.map(item => (
              <div key={item.title} className="flex flex-col gap-4 p-7 rounded-2xl border-2 border-slate-100 hover:border-blue-100 hover:shadow-lg transition-all" style={{ background: "#F8FAFC" }}>
                <span className="text-4xl">{item.icon}</span>
                <h3 className="text-lg font-bold" style={{ color: "#0F172A" }}>{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6" style={{ background: "#F8FAFC" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ color: "#0F172A" }}>{t.pricing.heading}</h2>
            <p className="text-slate-500">{t.pricing.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 flex flex-col gap-5 hover:shadow-md transition-shadow">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.pricing.free.label}</p>
                <p className="text-5xl font-extrabold mt-2" style={{ color: "#0F172A" }}>{t.pricing.free.price}</p>
                <p className="text-sm text-slate-400 mt-1">{t.pricing.free.note}</p>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {t.pricing.free.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600"><Check />{f}</li>
                ))}
              </ul>
              <a href="/login" className="block text-center py-3.5 rounded-xl border-2 font-bold transition-all hover:text-white" style={{ borderColor: "#0F172A", color: "#0F172A" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#0F172A"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#0F172A"; }}
              >{t.pricing.free.cta}</a>
            </div>
            {/* Pro */}
            <div className="rounded-2xl p-8 flex flex-col gap-5 relative overflow-hidden shadow-2xl" style={{ background: "#0F172A" }}>
              <div className="absolute top-5 right-5 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "#3B82F6" }}>
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
                {t.pricing.pro.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-200">
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#10B981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>{f}
                  </li>
                ))}
              </ul>
              <a href="/login" className="block text-center py-3.5 rounded-xl font-bold text-white transition-colors shadow-lg"
                style={{ background: "#3B82F6" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#2563EB")}
                onMouseLeave={e => (e.currentTarget.style.background = "#3B82F6")}
              >{t.pricing.pro.cta}</a>
            </div>
          </div>
          <p className="mt-8 text-sm text-center text-slate-400">{t.pricing.footer}</p>
        </div>
      </section>

      {/* ── 8. Testimonials ─────────────────────────────────────────── */}
      <section id="reviews" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-3" style={{ color: "#0F172A" }}>{t.testimonials.heading}</h2>
            <p className="text-slate-500">{t.testimonials.sub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.testimonials.items.map(item => (
              <div key={item.name} className="rounded-2xl p-7 flex flex-col gap-4 border-2 border-slate-100 hover:border-blue-100 hover:shadow-md transition-all" style={{ background: "#F8FAFC" }}>
                <Stars count={item.stars} />
                <p className="text-slate-600 text-sm leading-relaxed flex-1">"{item.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: "#3B82F6" }}>
                    {item.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "#0F172A" }}>{item.name}</p>
                    <p className="text-xs text-slate-400">{item.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. CTA Banner ───────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden" style={{ background: "#0F172A" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/15 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-5">{t.ctaBanner.heading}</h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">{t.ctaBanner.sub}</p>
          <a href="#generate"
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white text-xl font-bold transition-all shadow-2xl"
            style={{ background: "#3B82F6", boxShadow: "0 0 40px rgba(59,130,246,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2563EB")}
            onMouseLeave={e => (e.currentTarget.style.background = "#3B82F6")}
          >
            {t.ctaBanner.cta}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </section>

      {/* ── 10. Footer ──────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-6" style={{ background: "#0F172A", borderColor: "#1E293B" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-lg font-extrabold text-white">HomePlan<span className="text-blue-400">AI</span></span>
          <p className="text-sm text-slate-500">{t.footer}</p>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <a href="#pricing" className="hover:text-slate-300 transition-colors">{t.nav.pricing}</a>
            <a href="/login" className="hover:text-slate-300 transition-colors">{t.nav.signin}</a>
            <a href="/dashboard" className="hover:text-slate-300 transition-colors">{t.nav.dashboard}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
