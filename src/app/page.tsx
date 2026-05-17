"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── i18n translations ────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    nav: {
      how: "How it works",
      pricing: "Pricing",
      reviews: "Reviews",
      dashboard: "Dashboard",
      signin: "Sign in",
    },
    hero: {
      badge: "AI-Powered Floor Plan Generator",
      headline1: "Close ",
      headline2: "4x more deals",
      headline3: " with AI-powered home plans",
      sub: "Show clients their dream home in 30 seconds — before they sign. No architect needed.",
      stat1: { value: "30 sec", label: "to generate" },
      stat2: { value: "3 plans", label: "per session" },
      stat3: { value: "$0", label: "to start" },
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
      cta: "Generate Plans →",
      generating: "Generating Plans…",
      disclaimer: "No credit card required · 3 free plans included",
    },
    pain: {
      heading: "Sound familiar?",
      sub: "These are the three biggest deal-killers for home builders today.",
      items: [
        {
          icon: "😟",
          title: "Clients can't visualize — and walk away",
          desc: "When prospects can't picture their future home, they delay decisions. \"Let me think about it\" almost always means a lost deal.",
        },
        {
          icon: "💸",
          title: "Architects cost $2,000+ and take weeks",
          desc: "Hiring a draftsman for every prospect meeting isn't scalable. You're burning money and time on leads that may never convert.",
        },
        {
          icon: "📉",
          title: "Competitors show plans — you're losing deals",
          desc: "Builders who walk into meetings with visual proposals close more. If you're not showing plans, someone else is winning your clients.",
        },
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
    testimonials: {
      heading: "What builders are saying",
      sub: "Trusted by home builders across the US",
      items: [
        {
          name: "James R.",
          role: "Custom Home Builder · Texas",
          text: "I used to spend hours sketching plans for client meetings. Now I walk in with 3 AI-generated proposals and close deals on the spot.",
          stars: 5,
        },
        {
          name: "Maria L.",
          role: "General Contractor · Florida",
          text: "The PDF output looks incredibly professional. My clients are always impressed. This tool paid for itself on the first deal.",
          stars: 5,
        },
        {
          name: "Kevin T.",
          role: "Home Builder · Arizona",
          text: "Super fast and easy. I generate plans during the client call itself. It's become my secret weapon for winning new projects.",
          stars: 5,
        },
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
        features: ["Unlimited floor plan generations", "PDF export with your logo", "All room types", "Priority support", "Early access to new features"],
        cta: "Start 14-day free trial",
      },
      footer: "All plans include PDF export · No hidden fees · Cancel anytime",
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
    },
    hero: {
      badge: "Generador de Planos con IA",
      headline1: "Cierra ",
      headline2: "4x más contratos",
      headline3: " con planos de casas con IA",
      sub: "Muestra a tus clientes su hogar soñado en 30 segundos — antes de que firmen. Sin arquitecto.",
      stat1: { value: "30 seg", label: "para generar" },
      stat2: { value: "3 planos", label: "por sesión" },
      stat3: { value: "$0", label: "para empezar" },
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
      cta: "Generar Planos →",
      generating: "Generando Planos…",
      disclaimer: "Sin tarjeta de crédito · 3 planos gratis incluidos",
    },
    pain: {
      heading: "¿Te suena familiar?",
      sub: "Estos son los tres mayores obstáculos para los constructores de viviendas hoy.",
      items: [
        {
          icon: "😟",
          title: "Los clientes no visualizan — y se van",
          desc: "Cuando los prospectos no pueden imaginarse su futura casa, posponen decisiones. \"Déjame pensarlo\" casi siempre significa un contrato perdido.",
        },
        {
          icon: "💸",
          title: "Los arquitectos cobran $2,000+ y tardan semanas",
          desc: "Contratar un delineante para cada reunión no es sostenible. Estás gastando dinero y tiempo en prospectos que quizás nunca firman.",
        },
        {
          icon: "📉",
          title: "Tu competencia muestra planos — tú pierdes contratos",
          desc: "Los constructores que llegan con propuestas visuales cierran más. Si no muestras planos, alguien más está ganando a tus clientes.",
        },
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
    testimonials: {
      heading: "Lo que dicen los constructores",
      sub: "Utilizado por constructores en todo Estados Unidos",
      items: [
        {
          name: "James R.",
          role: "Constructor de casas · Texas",
          text: "Solía pasar horas dibujando planos para las reuniones. Ahora entro con 3 propuestas generadas por IA y cierro contratos en el momento.",
          stars: 5,
        },
        {
          name: "Maria L.",
          role: "Contratista General · Florida",
          text: "El PDF se ve increíblemente profesional. Mis clientes siempre quedan impresionados. Esta herramienta se pagó sola en el primer contrato.",
          stars: 5,
        },
        {
          name: "Kevin T.",
          role: "Constructor de casas · Arizona",
          text: "Rápido y fácil. Genero planos durante la llamada con el cliente. Se ha convertido en mi arma secreta para ganar nuevos proyectos.",
          stars: 5,
        },
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
        features: ["Generaciones de planos ilimitadas", "PDF con tu logo", "Todos los tipos de habitación", "Soporte prioritario", "Acceso anticipado a nuevas funciones"],
        cta: "Iniciar prueba gratis de 14 días",
      },
      footer: "Todos los planes incluyen PDF · Sin costos ocultos · Cancela cuando quieras",
    },
    footer: "© 2026 HomePlanAI. Construido para constructores de viviendas.",
  },
} as const;

type Lang = keyof typeof TRANSLATIONS;

// ── Spinner ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── Stars ─────────────────────────────────────────────────────────────
function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Check icon ────────────────────────────────────────────────────────
function Check({ className }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${className ?? ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ lotSize: "", budget: "", familySize: "" });
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

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 429 && data.code === "LIMIT_EXCEEDED") {
        router.push(`/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Something went wrong");

      sessionStorage.setItem("floorPlans", JSON.stringify(data.plans));
      sessionStorage.setItem("formData", JSON.stringify(form));
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plans");
      setLoading(false);
    }
  }

  const isValid = form.lotSize && form.budget && form.familySize;

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-50">
        <span className="text-xl font-bold tracking-tight text-gray-900">
          HomePlan<span className="text-blue-600">AI</span>
        </span>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <a href="#how" className="hidden sm:block hover:text-gray-900 transition-colors">{t.nav.how}</a>
          <a href="#pricing" className="hidden sm:block hover:text-gray-900 transition-colors">{t.nav.pricing}</a>
          <a href="#testimonials" className="hidden sm:block hover:text-gray-900 transition-colors">{t.nav.reviews}</a>

          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            title={lang === "en" ? "Switch to Spanish" : "Cambiar a inglés"}
          >
            <span className="text-base leading-none">{lang === "en" ? "🇲🇽" : "🇺🇸"}</span>
            {lang === "en" ? "ES" : "EN"}
          </button>

          {userEmail ? (
            <a href="/dashboard" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              {t.nav.dashboard}
            </a>
          ) : (
            <a href="/login" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              {t.nav.signin}
            </a>
          )}
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center px-6 py-20 text-center bg-gradient-to-b from-white to-blue-50/40">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-semibold tracking-wide text-blue-700 uppercase bg-blue-50 rounded-full border border-blue-100">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          {t.hero.badge}
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-6xl">
          {t.hero.headline1}
          <span className="text-blue-600 relative">
            {t.hero.headline2}
            <span className="absolute -bottom-1 left-0 right-0 h-1 bg-blue-200 rounded-full opacity-60" />
          </span>
          {t.hero.headline3}
        </h1>

        <p className="mt-6 max-w-xl text-lg text-gray-500 leading-relaxed">
          {t.hero.sub}
        </p>

        {/* Number badges */}
        <div className="mt-8 flex items-center gap-6 flex-wrap justify-center">
          {[t.hero.stat1, t.hero.stat2, t.hero.stat3].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-gray-900">{stat.value}</span>
              <span className="text-xs text-gray-500 mt-0.5">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="mt-10 w-full max-w-2xl">
          <p className="text-sm font-semibold text-gray-700 mb-3">{t.form.title}</p>
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-2xl shadow-lg p-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">{t.form.lotLabel}</label>
                <input
                  type="number"
                  name="lotSize"
                  value={form.lotSize}
                  onChange={handleChange}
                  placeholder={t.form.lotPlaceholder}
                  min={1000}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">{t.form.budgetLabel}</label>
                <input
                  type="number"
                  name="budget"
                  value={form.budget}
                  onChange={handleChange}
                  placeholder={t.form.budgetPlaceholder}
                  min={50000}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">{t.form.familyLabel}</label>
                <select
                  name="familySize"
                  value={form.familySize}
                  onChange={handleChange}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                >
                  <option value="">{t.form.familyPlaceholder}</option>
                  {t.form.familyOptions.map((opt, i) => (
                    <option key={i} value={String(i + 1)}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={!isValid || loading}
              className="mt-8 w-full py-4 rounded-xl bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <><Spinner />{t.form.generating}</> : t.form.cta}
            </button>
          </form>

          <p className="mt-4 text-sm text-gray-400">{t.form.disclaimer}</p>
        </div>
      </section>

      {/* ── Pain Points ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t.pain.heading}</h2>
          <p className="text-gray-500 mb-12">{t.pain.sub}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.pain.items.map((item) => (
              <div
                key={item.title}
                className="bg-red-50 border border-red-100 rounded-2xl p-6 text-left flex flex-col gap-3"
              >
                <span className="text-4xl">{item.icon}</span>
                <h3 className="font-bold text-gray-900 text-base leading-snug">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Bridge to solution */}
          <div className="mt-12 inline-flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-2xl shadow-lg">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-semibold text-lg">
              {lang === "en"
                ? "HomePlanAI solves all three — in 30 seconds."
                : "HomePlanAI resuelve los tres — en 30 segundos."}
            </span>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section id="how" className="bg-gray-50 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">{t.how.heading}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.how.steps.map((item) => (
              <div key={item.step} className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-md">
                  {item.step}
                </div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t.testimonials.heading}</h2>
          <p className="text-gray-500 mb-12">{t.testimonials.sub}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.testimonials.items.map((item) => (
              <div key={item.name} className="bg-gray-50 rounded-2xl p-6 text-left flex flex-col gap-4 border border-gray-100">
                <Stars count={item.stars} />
                <p className="text-gray-700 text-sm leading-relaxed">"{item.text}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t.pricing.heading}</h2>
          <p className="text-gray-500 mb-12">{t.pricing.sub}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-left flex flex-col gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t.pricing.free.label}</p>
                <p className="text-4xl font-extrabold text-gray-900 mt-1">{t.pricing.free.price}</p>
                <p className="text-sm text-gray-400 mt-1">{t.pricing.free.note}</p>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-gray-600">
                {t.pricing.free.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/login"
                className="mt-auto block text-center py-3 rounded-xl border border-blue-600 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
              >
                {t.pricing.free.cta}
              </a>
            </div>

            {/* Pro */}
            <div className="bg-blue-600 rounded-2xl p-8 text-left flex flex-col gap-4 relative overflow-hidden shadow-xl shadow-blue-200">
              <div className="absolute top-4 right-4 bg-white text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                {t.pricing.pro.badge}
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-200 uppercase tracking-wide">{t.pricing.pro.label}</p>
                <p className="text-4xl font-extrabold text-white mt-1">
                  {t.pricing.pro.price}<span className="text-lg font-medium text-blue-200">{t.pricing.pro.period}</span>
                </p>
                <p className="text-sm text-blue-200 mt-1">{t.pricing.pro.note}</p>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-white">
                {t.pricing.pro.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="text-blue-200" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/login"
                className="mt-auto block text-center py-3 rounded-xl bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
              >
                {t.pricing.pro.cta}
              </a>
            </div>
          </div>

          <p className="mt-8 text-sm text-gray-400">{t.pricing.footer}</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="py-8 text-center text-sm text-gray-400 border-t border-gray-100">
        {t.footer}
      </footer>
    </div>
  );
}
