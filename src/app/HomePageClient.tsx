"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProductHuntBadge } from "@/components/ProductHuntBadge";
import { SocialProofBar } from "@/components/SocialProofBar";
import { track } from "@vercel/analytics";
import { getMarketPack, marketFromHost, type Market } from "@/lib/market";

// ── Constants ────────────────────────────────────────────────────────
const CUSTOM_PLAN_MAILTO = "mailto:hello@splanai.com?subject=SplanAI%20Custom%20plan%20inquiry&body=Team%20size%3A%0D%0AProposals%20per%20month%3A%0D%0AMarkets%20%2F%20MLS%3A%0D%0A"
// Set NEXT_PUBLIC_CALENDLY_URL in Vercel env to activate Calendly CTA; falls back to mailto until configured
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";
const CALENDLY_READY = Boolean(CALENDLY_URL && !CALENDLY_URL.startsWith("<<FILL"));

// ── i18n ─────────────────────────────────────────────────────────────
const T = {
  en: {
    nav: { how: "How it works", pricing: "Pricing", reviews: "Examples", blog: "Blog", dashboard: "Dashboard", signin: "Sign in", cta: "Start Free Trial" },
    hero: {
      badge: "Featured on Product Hunt",
      headline1: "Close more home-building deals.",
      headline2: "Without the 3-day proposal wait.",
      sub: "Enter lot details → get 3 buyer-ready home concept proposals in 30 seconds. Share a live portal. Close faster.",
      ctaPrimary: "Generate Plans Free →",
      ctaSecondary: "See how it works",
      tryDemo: "Not ready to sign up? Try a sample proposal first — no email needed →",
      stat1: { value: "30 sec", label: "to generate" },
      stat2: { value: "3 plans", label: "per session" },
      stat3: { value: "14-day", label: "free trial" },
    },
    trust: { label: "Powered by" },
    form: {
      title: "Generate your first proposal — free",
      lotLabel: "Lot Size (sq ft)", lotPlaceholder: "e.g. 8500",
      budgetLabel: "Budget (USD)", budgetPlaceholder: "e.g. 350000",
      familyLabel: "Family Size", familyPlaceholder: "Select…",
      familyOptions: ["1 person", "2 people", "3 people", "4 people", "5 people", "6+ people"],
      cityLabel: "City", cityPlaceholder: "e.g. Austin",
      stateLabel: "State", statePlaceholder: "e.g. TX",
      streetLabel: "Street Address", streetPlaceholder: "e.g. 1234 Oak Lane, Austin, TX",
      streetHint: "Optional — adds neighborhood data (lot size & zoning: connect MLS on Pro)",
      locationNote: "Optional — adds neighborhood & market data",
      cta: "Generate 3 Plans →", generating: "Generating Plans…",
      signupNote: "Quick signup to receive your plans · No credit card required",
      disclaimer: "No credit card required · 30-second signup · 3 free plans included",
    },
    pain: {
      heading: "Sound familiar?",
      sub: "The three biggest deal-killers for home builders today.",
      items: [
        {
          headline: "Clients ask for a proposal. You spend 3 days on it.",
          body: "By then, they've moved on. Slow proposals don't just lose time — they lose deals.",
          solution: "SplanAI generates 3 plans in 30 seconds.",
        },
        {
          headline: "You show a floor plan. They can't visualize it.",
          body: "A static sketch doesn't sell. Clients need to see their future home — with real neighborhood data and financing numbers.",
          solution: "Share a live portal. Clients explore on their own.",
        },
        {
          headline: "You send a PDF. It sits in their inbox.",
          body: "You have no idea if they even opened it. While you wait, a competitor is already following up.",
          solution: "Know exactly when they open it, and which plan they love.",
        },
      ],
    },
    how: {
      heading: "From lot to client presentation in 30 seconds.",
      steps: [
        { step: "01", title: "Enter lot details", desc: "Lot size, budget, family size. Optional: city & state for neighborhood data." },
        { step: "02", title: "AI generates 3 plans", desc: "Get three distinct home concepts with neighborhood data, avg rent, and mortgage estimates built in." },
        { step: "03", title: "Share with your client", desc: "Download a branded PDF or send a unique link. Get notified when they view it." },
      ],
    },
    diff: {
      heading: "The sales layer between your lot and the signed contract.",
      sub: "SplanAI is a sales tool — not a design tool.",
      items: [
        { title: "Neighborhood Intelligence", desc: "Auto-fetch nearby schools, police/fire stations, and market rents via Google Maps and RentCast." },
        { title: "Branded PDF in One Click", desc: "Professional proposals with your logo, room breakdown, and cost estimate. Print-ready." },
        { title: "Real-Time Client Tracking", desc: "Know the moment a client opens the link, see which concept they engaged, and send a ready-made follow-up." },
        { title: "Buyers Configure It Live", desc: "Clients adjust size, beds, baths, and style — price and monthly payment update instantly." },
        { title: "Layout at a Glance", desc: "A clean visual of each concept's room layout — easy to read, no blueprint required." },
        { title: "A Portal That Stays Alive", desc: "Favorites, saved settings, and a 'new since your last visit' nudge bring buyers back." },
      ],
    },
    mission: {
      heading: "Built for builders who close deals, not draw blueprints.",
      body: "SplanAI isn't a design tool. It's the sales layer between your lot and your client's signature — home concept proposals, market data, financing, and client intelligence, all in one place.",
    },
    pricing: {
      heading: "Simple, transparent pricing",
      sub: "Start free. Upgrade when you're ready.",
      free: { label: "Free", price: "$0", note: "No credit card required", features: ["3 proposal generations / month", "SplanAI branded PDF export", "Neighborhood & market data", "Client sharing portal + view tracking", "All room types", "Email support"], cta: "Get started free" },
      pro: { label: "Pro", price: "$49", period: "/mo", note: "14-day free trial, then $49/mo. Cancel anytime before it ends.", badge: "MOST POPULAR", features: ["Everything in Free, plus:", "100 proposals/mo · 1 seat", "Branded PDF with your logo (Powered by SplanAI footer included)", "MLS listing data — real lot size & zoning in every plan (requires your MLS license)", "Priority support"], cta: "Start 14-day free trial" },
      team: { label: "Team", price: "$149", period: "/mo", note: "14-day free trial, then $149/mo. Cancel anytime before it ends.", features: ["Everything in Pro, plus:", "Unlimited proposals/mo (fair use*) · up to 15 seats", "Team dashboard & member KPIs", "White-label PDF — your logo only, zero SplanAI branding", "Dedicated support"], cta: "Start 14-day free trial" },
      custom: { label: "Custom", features: ["Everything in Team, plus:", "Higher generation volume", "Priority onboarding", "Multiple MLS connections", "Pricing sized to your sales team"], cta: "Talk to us" },
      footer: "All plans include PDF export · No hidden fees · Cancel anytime",
    },
    faq: [
      { q: "Is MLS integration legal?", a: "Yes. SplanAI connects to MLS data via the IDX policy framework established by the National Association of Realtors (NAR). Your MLS license is linked to your account, all API calls are logged in our audit system, and data is displayed in real time — never stored or redistributed. We comply with all NAR IDX guidelines and individual MLS board rules." },
      { q: "What data sources do you use?", a: "SplanAI uses Google Maps (neighborhood places & geocoding), RentCast (market rent and sale price data), the St. Louis Fed (FRED) for current mortgage rates, Anthropic Claude AI (proposal generation), and optionally your MLS license for listing data. All sources are listed on your dashboard." },
      { q: "Is my client data secure?", a: "Yes. All data is stored in a Supabase database with row-level security — only you can access your plans and client links. Shared links expire and can be deactivated anytime. We never sell your data." },
      { q: "Does it work in my state?", a: "SplanAI works nationwide for AI plan generation and market data. Neighborhood data (Google Maps) is available in all 50 states. MLS connectivity depends on your local MLS board — full coverage map coming soon." },
      { q: "Can I cancel anytime?", a: "Absolutely. Cancel from your dashboard in one click — no phone calls, no forms. Your Pro access continues until the end of your billing period." },
    ],
    security: {
      heading: "Your data stays yours.",
      sub: "Built with privacy and compliance in mind.",
      items: [
        { text: "Client data is never used to train AI models" },
        { text: "All plans and portal activity are encrypted" },
        { text: "MLS-compliant audit logs on every data call" },
      ],
    },
    testimonials: {
      heading: "Built for home builders who close deals",
      sub: "Early access — be one of our founding builders",
      items: [] as const,
    },
    ctaBanner: { heading: "Ready to close more deals?", sub: "Be one of the first builders to close deals with AI-generated proposals.", cta: "Start Free — No Credit Card" },
    footer: "© 2026 SplanAI. Built for home builders.",
    faqHeading: "Frequently Asked Questions",
    reassure: ["No credit card to start free", "14-day trial on Pro & Team", "Cancel anytime, no questions"],
    customPrice: "For 50+ employees",
    customPriceSub: "Volume pricing · Talk to us",
    wyg: {
      eyebrow: "What you get",
      heading: "30 seconds. 3 proposals. Ready to close.",
      sub: "Actual output from a live SplanAI session — generated with real AI and real market data.",
      note: "Built by a solo founder. No design agency. No fluff.",
      sec: "~30 sec",
      s1Title: "AI generates 3 distinct home concept proposals",
      estRange: "Est. range — finishes-dependent.",
      sqft: "sq ft",
      s1Foot: "Actual AI output — matches live portal at /s/nfhkewvz",
      s2Title: "Share a live client portal — one click",
      s2Body: "Your client gets a personal portal with all 3 plans — floor-plan diagrams, cost ranges, and a mortgage calculator they can adjust. If they request pre-qualification, book a meeting, or tap \"I'm interested,\" you get an email right away. You also see the moment they open it.",
      s2Cta: "See a live portal example →",
      s3aTitle: "Download branded PDF",
      s3aBody: "Professional PDF with your logo, full room breakdown, cost range and mortgage estimate, and neighborhood data. Print-ready for client meetings.",
      s3bTitle: "MLS-enriched plans",
      s3bBody: "Connect your own MLS license via Trestle to auto-fill real lot size & zoning into every concept plan. NAR/IDX-compliant — every data call is audit-logged. Requires your own MLS license.",
    },
    modal: {
      redirecting: "Redirecting…",
      freeTitle: "You've used your 3 free plans this month",
      freeBody: "Your free plan includes 3 floor plan generations per month. Upgrade to Pro for 100/mo, your own branding, and MLS data.",
      freeCta: "Start Pro Trial — $49/mo",
      proTitle: "You've hit your 100/mo limit",
      proBody: "Team plan gives you unlimited generations (fair use), up to 15 seats, and white-label PDFs.",
      proCta: "Upgrade to Team — $149/mo",
      proSecondary: "Generating at higher volume? Talk to us →",
      otherTitle: "Generation limit reached",
      otherBody: "Contact us to discuss a custom plan sized to your team.",
      otherCta: "Talk to us →",
    },
  },
  es: {
    nav: { how: "Cómo funciona", pricing: "Precios", reviews: "Ejemplos", blog: "Blog", dashboard: "Panel", signin: "Iniciar sesión", cta: "Prueba Gratis" },
    hero: {
      badge: "Destacado en Product Hunt",
      headline1: "Cierra más contratos de construcción.",
      headline2: "Sin esperar 3 días por la propuesta.",
      sub: "Ingresa los datos del lote → obtén 3 propuestas de concepto listas para el cliente en 30 segundos. Comparte un portal en vivo. Cierra más rápido.",
      ctaPrimary: "Genera Propuestas Gratis →",
      ctaSecondary: "Cómo funciona",
      tryDemo: "¿Aún no quieres registrarte? Prueba una propuesta de ejemplo — sin correo →",
      stat1: { value: "30 seg", label: "para generar" },
      stat2: { value: "3 propuestas", label: "por sesión" },
      stat3: { value: "14 días", label: "de prueba" },
    },
    trust: { label: "Con tecnología de" },
    form: {
      title: "Genera tu primera propuesta — gratis",
      lotLabel: "Tamaño del terreno (pies²)", lotPlaceholder: "ej. 8500",
      budgetLabel: "Presupuesto (USD)", budgetPlaceholder: "ej. 350000",
      familyLabel: "Tamaño de la familia", familyPlaceholder: "Seleccionar…",
      familyOptions: ["1 persona", "2 personas", "3 personas", "4 personas", "5 personas", "6+ personas"],
      cityLabel: "Ciudad", cityPlaceholder: "ej. Austin",
      stateLabel: "Estado", statePlaceholder: "ej. TX",
      streetLabel: "Dirección", streetPlaceholder: "ej. 1234 Oak Lane, Austin, TX",
      streetHint: "Opcional — agrega datos del vecindario (tamaño del lote y zonificación: conecta MLS en Pro)",
      locationNote: "Opcional — agrega datos del vecindario y mercado",
      cta: "Generar 3 Propuestas →", generating: "Generando Propuestas…",
      signupNote: "Registro rápido para recibir tus propuestas · Sin tarjeta de crédito",
      disclaimer: "Sin tarjeta de crédito · Registro en 30 segundos · 3 propuestas gratis incluidas",
    },
    pain: {
      heading: "¿Te suena familiar?",
      sub: "Los tres mayores obstáculos para los constructores hoy.",
      items: [
        {
          headline: "El cliente pide una propuesta. Pasas 3 días haciéndola.",
          body: "Para entonces, ya se fue. Las propuestas lentas no solo pierden tiempo — pierden contratos.",
          solution: "SplanAI genera 3 propuestas en 30 segundos.",
        },
        {
          headline: "Muestras un plano. No lo visualizan.",
          body: "Un boceto estático no vende. Los clientes necesitan ver su futuro hogar — con datos del vecindario y números de financiamiento reales.",
          solution: "Comparte un portal en vivo. Los clientes exploran solos.",
        },
        {
          headline: "Envías un PDF. Se queda en su bandeja.",
          body: "No sabes si lo abrieron. Mientras esperas, un competidor ya está haciendo seguimiento.",
          solution: "Sabe exactamente cuándo lo abren y qué propuesta les gusta.",
        },
      ],
    },
    how: {
      heading: "Del lote a la presentación al cliente en 30 segundos.",
      steps: [
        { step: "01", title: "Ingresa los datos del lote", desc: "Tamaño, presupuesto, familia. Opcional: ciudad y estado para datos del vecindario." },
        { step: "02", title: "La IA genera 3 propuestas", desc: "Obtén tres conceptos distintos con datos del vecindario, renta promedio y estimados de hipoteca incluidos." },
        { step: "03", title: "Comparte con tu cliente", desc: "Descarga el PDF o envía un enlace único. Recibe una notificación cuando lo vean." },
      ],
    },
    diff: {
      heading: "La capa de ventas entre tu lote y el contrato firmado.",
      sub: "SplanAI es una herramienta de ventas — no de diseño.",
      items: [
        { title: "Inteligencia de Vecindario", desc: "Escuelas, estaciones de policía/bomberos y renta del mercado vía Google Maps y RentCast." },
        { title: "PDF con Tu Marca en Un Clic", desc: "Propuestas profesionales con tu logo, distribución de habitaciones y estimado de costo." },
        { title: "Seguimiento en Tiempo Real", desc: "Sabe al instante cuando tu cliente abre el enlace, qué concepto le interesa, y envía un seguimiento listo para usar." },
        { title: "El Cliente lo Configura en Vivo", desc: "Ajusta tamaño, recámaras, baños y estilo — el precio y el pago mensual se recalculan al instante." },
        { title: "Distribución de un Vistazo", desc: "Una vista clara de la distribución de cada concepto, fácil de entender." },
        { title: "Un Portal que Sigue Vivo", desc: "Favoritos, ajustes guardados y un aviso de 'novedades desde tu última visita' hacen volver al cliente." },
      ],
    },
    mission: {
      heading: "Construido para constructores que cierran contratos, no que dibujan planos.",
      body: "SplanAI no es una herramienta de diseño. Es la capa de ventas entre tu lote y la firma de tu cliente — propuestas, datos de mercado, financiamiento e inteligencia del cliente, todo en un solo lugar.",
    },
    pricing: {
      heading: "Precios simples y transparentes",
      sub: "Empieza gratis. Actualiza cuando estés listo.",
      free: { label: "Gratis", price: "$0", note: "Sin tarjeta de crédito", features: ["3 generaciones / mes", "PDF con marca SplanAI", "Datos de vecindario y mercado", "Portal para clientes + seguimiento de vistas", "Todos los tipos de habitación", "Soporte por email"], cta: "Empezar gratis" },
      pro: { label: "Pro", price: "$49", period: "/mes", note: "14 días de prueba gratis, luego $49/mes. Cancela antes que termine.", badge: "MÁS POPULAR", features: ["Todo lo de Gratis, más:", "100 propuestas/mes · 1 usuario", "PDF con tu logo (pie Powered by SplanAI incluido)", "Datos MLS — tamaño del lote y zonificación reales en cada propuesta (requiere tu licencia MLS)", "Soporte prioritario"], cta: "Iniciar prueba gratis" },
      team: { label: "Equipo", price: "$149", period: "/mes", note: "14 días de prueba gratis, luego $149/mes. Cancela antes que termine.", features: ["Todo lo de Pro, más:", "Propuestas ilimitadas/mes (uso justo*) · hasta 15 usuarios", "Panel de equipo y KPIs por miembro", "PDF sin marca — solo tu logo, sin branding de SplanAI", "Soporte dedicado"], cta: "Iniciar prueba gratis" },
      custom: { label: "Custom", features: ["Todo lo de Equipo, más:", "Mayor volumen de generaciones", "Incorporación prioritaria", "Múltiples conexiones MLS", "Precio según tu equipo de ventas"], cta: "Contáctanos" },
      footer: "Todos los planes incluyen PDF · Sin costos ocultos · Cancela cuando quieras",
    },
    faq: [
      { q: "¿Es legal la integración MLS?", a: "Sí. SplanAI se conecta a datos MLS bajo el marco de política IDX de la NAR. Tu licencia MLS se vincula a tu cuenta, todas las llamadas API se registran, y los datos se muestran en tiempo real — nunca almacenados ni redistribuidos." },
      { q: "¿Qué fuentes de datos usa?", a: "Google Maps (vecindario y geocodificación), RentCast (datos de renta y precios de venta del mercado), la Reserva Federal de St. Louis (FRED) para tasas hipotecarias, Anthropic Claude AI (generación de propuestas) y opcionalmente tu licencia MLS para datos de listados." },
      { q: "¿Mis datos de clientes son seguros?", a: "Sí. Todos los datos se almacenan con seguridad de nivel de fila en Supabase — solo tú accedes a tus propuestas y enlaces. Los enlaces compartidos se pueden desactivar en cualquier momento." },
      { q: "¿Funciona en mi estado?", a: "SplanAI funciona en los 50 estados para generación de propuestas y datos de mercado. La conectividad MLS depende de tu junta MLS local." },
      { q: "¿Puedo cancelar en cualquier momento?", a: "Por supuesto. Cancela desde tu panel con un solo clic — sin llamadas telefónicas ni formularios. Tu acceso Pro continúa hasta el final del período de facturación." },
    ],
    security: {
      heading: "Tus datos son tuyos.",
      sub: "Construido con privacidad y cumplimiento en mente.",
      items: [
        { text: "Los datos de clientes nunca se usan para entrenar modelos de IA" },
        { text: "Todas las propuestas y actividad del portal están encriptadas" },
        { text: "Registros de auditoría conformes con MLS en cada consulta de datos" },
      ],
    },
    testimonials: {
      heading: "Hecho para constructores que cierran contratos",
      sub: "Acceso anticipado — sé uno de nuestros primeros constructores",
      items: [] as const,
    },
    ctaBanner: { heading: "¿Listo para cerrar más contratos?", sub: "Sé uno de los primeros constructores en cerrar contratos con propuestas de IA.", cta: "Empieza Gratis — Sin Tarjeta" },
    footer: "© 2026 SplanAI. Construido para constructores.",
    faqHeading: "Preguntas frecuentes",
    reassure: ["Sin tarjeta para empezar gratis", "Prueba de 14 días en Pro y Equipo", "Cancela cuando quieras, sin preguntas"],
    customPrice: "Para equipos de 50+ empleados",
    customPriceSub: "Precio por volumen · Hablemos",
    wyg: {
      eyebrow: "Lo que obtienes",
      heading: "30 segundos. 3 propuestas. Listo para cerrar.",
      sub: "Resultado real de una sesión en vivo de SplanAI — generado con IA real y datos de mercado reales.",
      note: "Hecho por un fundador en solitario. Sin agencia de diseño. Sin rodeos.",
      sec: "~30 seg",
      s1Title: "La IA genera 3 propuestas de concepto distintas",
      estRange: "Rango est. — depende de los acabados.",
      sqft: "pies²",
      s1Foot: "Resultado real de IA — coincide con el portal en vivo en /s/nfhkewvz",
      s2Title: "Comparte un portal de cliente en vivo — un clic",
      s2Body: "Tu cliente recibe un portal personal con las 3 propuestas — diagramas del plano, rangos de costo y una calculadora hipotecaria que puede ajustar. Si solicita precalificación, agenda una reunión o toca \"Me interesa\", recibes un email al instante. También ves el momento en que lo abre.",
      s2Cta: "Ver un portal en vivo de ejemplo →",
      s3aTitle: "Descarga un PDF con tu marca",
      s3aBody: "PDF profesional con tu logo, desglose completo de habitaciones, rango de costo y estimado de hipoteca, y datos del vecindario. Listo para imprimir para reuniones con clientes.",
      s3bTitle: "Planes enriquecidos con MLS",
      s3bBody: "Conecta tu propia licencia MLS vía Trestle para autocompletar el tamaño real del lote y la zonificación en cada concepto. Cumple con NAR/IDX — cada consulta queda registrada en auditoría. Requiere tu propia licencia MLS.",
    },
    modal: {
      redirecting: "Redirigiendo…",
      freeTitle: "Has usado tus 3 propuestas gratuitas de este mes",
      freeBody: "Tu plan gratuito incluye 3 propuestas al mes. Actualiza a Pro para obtener 100 propuestas al mes, tu propia marca y datos MLS.",
      freeCta: "Iniciar prueba de Pro — $49/mes",
      proTitle: "Alcanzaste tu límite de 100/mes",
      proBody: "El plan Equipo te da propuestas ilimitadas (uso justo), hasta 15 usuarios y PDFs con solo tu marca.",
      proCta: "Actualizar a Equipo — $149/mes",
      proSecondary: "¿Generas a mayor volumen? Hablemos →",
      otherTitle: "Límite de generación alcanzado",
      otherBody: "Contáctanos para hablar de un plan a medida para tu equipo.",
      otherCta: "Hablemos →",
    },
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

// ── Stroke icon set (DESIGN.md: one icon system, currentColor, no emoji in LP chrome) ─
const ICON_PATHS = {
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  layout: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
  inbox: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
  clipboard: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  layers: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  mappin: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  doc: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  sliders: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  grid: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  clipcheck: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
} as const;
type IconName = keyof typeof ICON_PATHS;

function Icon({ name, className = "w-6 h-6" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}

// Section icon assignments (language-independent — kept OUT of the i18n T object so EN/ES can never drift)
const PAIN_ICONS: IconName[] = ["clock", "layout", "inbox"];
const HOW_ICONS: IconName[] = ["clipboard", "layers", "link"];
const DIFF_ICONS: IconName[] = ["mappin", "doc", "eye", "sliders", "grid", "refresh"];
const SECURITY_ICONS: IconName[] = ["lock", "shield", "clipcheck"];

// ── Scroll-triggered fade+slide-up (respects prefers-reduced-motion) ─
function AnimateIn({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(22px)",
      }}
    >
      {children}
    </div>
  );
}

// ── Hero product preview — 4-phase sequence animation ────────────────
//
// Phase 0 (0-2.5s)  : Input form with mock values appearing
// Phase 1 (2.5-5s)  : "Generating plans… ~30 sec" spinner (accelerated for demo)
// Phase 2 (5-9.5s)  : Results reveal — neighborhood → mortgage → plans stagger
// Phase 3 (9.5-12s) : "Client viewed" badge slides in, hold, then loop
//
// prefers-reduced-motion → skip to end state (phase 2 fully visible, no animation)
// User hover → pause loop; mouse leave → resume

const HERO_PLANS = [
  { id: "01", name: "Craftsman Ranch",   sqft: "2,100 sqft", cost: "$315K", bd: "3bd/2ba",   color: "blue",    bgClass: "bg-blue-500",    selected: false },
  { id: "02", name: "Modern Farmhouse",  sqft: "2,350 sqft", cost: "$352K", bd: "4bd/2.5ba", color: "emerald", bgClass: "bg-emerald-500", selected: true  },
  { id: "03", name: "Contemporary",      sqft: "1,980 sqft", cost: "$297K", bd: "3bd/2ba",   color: "violet",  bgClass: "bg-violet-500",  selected: false },
] as const;

const HERO_CHIPS = [
  { icon: "🏫", label: "Schools",  val: "★ 8.4/10", bg: "bg-blue-50",   border: "border-blue-100"   },
  { icon: "🛡️", label: "Safety",   val: "High",     bg: "bg-emerald-50", border: "border-emerald-100" },
  { icon: "📊", label: "Avg Rent", val: "$1,850/mo", bg: "bg-violet-50",  border: "border-violet-100"  },
] as const;

// Phase durations in ms
const PHASE_MS = { input: 2500, generating: 2500, results: 4500, badge: 2500 };

type HeroPhase = 0 | 1 | 2 | 3;

function fi(visible: boolean, delay = 0): React.CSSProperties {
  return {
    transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(8px)",
  };
}

function HeroPreview() {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState<HeroPhase>(reduced ? 2 : 0);
  const [planVisible, setPlanVisible] = useState([false, false, false]);
  const paused = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced) return;

    function runCycle() {
      if (paused.current) { timerRef.current = setTimeout(runCycle, 200); return; }

      setPhase(0);
      setPlanVisible([false, false, false]);

      timerRef.current = setTimeout(() => {
        if (paused.current) { timerRef.current = setTimeout(runCycle, 200); return; }
        setPhase(1);

        timerRef.current = setTimeout(() => {
          if (paused.current) { timerRef.current = setTimeout(runCycle, 200); return; }
          setPhase(2);
          // Stagger plan cards
          [0, 1, 2].forEach(i => {
            timerRef.current = setTimeout(() => setPlanVisible(v => { const n = [...v] as [boolean,boolean,boolean]; n[i] = true; return n; }), i * 350);
          });

          timerRef.current = setTimeout(() => {
            if (paused.current) { timerRef.current = setTimeout(runCycle, 200); return; }
            setPhase(3);
            timerRef.current = setTimeout(runCycle, PHASE_MS.badge);
          }, PHASE_MS.results);
        }, PHASE_MS.generating);
      }, PHASE_MS.input);
    }

    runCycle();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [reduced]);

  const showInput      = phase === 0;
  const showGenerating = phase === 1;
  const showResults    = phase >= 2;
  const showBadge      = phase >= 3;
  const chipVisible    = showResults;

  return (
    <div
      className="relative w-full max-w-lg mx-auto lg:mx-0"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div className="absolute -inset-6 bg-blue-500/20 rounded-3xl blur-3xl" />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">

        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-900/80 border-b border-slate-700">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-xs text-slate-500 font-mono">
            {showResults ? "splanai.com/results" : "splanai.com"}
          </span>
        </div>

        <div className="p-4 bg-slate-50 min-h-[220px] relative">

          {/* ── Phase 0: Input form ──────────────────────────────── */}
          <div
            aria-hidden={!showInput}
            style={{
              position: showInput ? "relative" : "absolute",
              inset: showInput ? undefined : 0,
              padding: showInput ? undefined : "1rem",
              transition: "opacity 0.35s ease",
              opacity: showInput ? 1 : 0,
              pointerEvents: showInput ? "auto" : "none",
            }}
          >
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Generate 3 plans →</p>
            <div className="flex flex-col gap-2">
              {[
                { label: "Lot Size",    val: "8,500 sq ft",  delay: 200  },
                { label: "Budget",      val: "$450,000",      delay: 500  },
                { label: "Family Size", val: "4 people",      delay: 800  },
                { label: "City, State", val: "Austin, TX",    delay: 1100 },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2" style={fi(showInput, f.delay)}>
                  <span className="text-xs text-slate-400 w-20 shrink-0">{f.label}</span>
                  <span className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800">{f.val}</span>
                </div>
              ))}
            </div>
            <div style={fi(showInput, 1400)} className="mt-3 w-full py-2 rounded-lg bg-blue-500 text-white text-xs font-bold text-center">
              Generate 3 Plans →
            </div>
          </div>

          {/* ── Phase 1: Generating spinner ──────────────────────── */}
          <div
            aria-hidden={!showGenerating}
            style={{
              position: "absolute", inset: 0, padding: "1rem",
              transition: "opacity 0.35s ease",
              opacity: showGenerating ? 1 : 0,
              pointerEvents: showGenerating ? "auto" : "none",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem",
            }}
          >
            <svg className="w-7 h-7 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm font-semibold text-slate-700">Generating plans…</p>
            <p className="text-xs text-slate-400">~30 sec · AI + neighborhood data</p>
            <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-blue-500"
                style={{
                  width: showGenerating ? "88%" : "2%",
                  transition: showGenerating ? `width ${PHASE_MS.generating - 200}ms ease-out 100ms` : "none",
                }}
              />
            </div>
          </div>

          {/* ── Phase 2+3: Results ───────────────────────────────── */}
          <div
            aria-hidden={!showResults}
            style={{
              position: showResults ? "relative" : "absolute",
              inset: showResults ? undefined : 0,
              padding: showResults ? undefined : "1rem",
              transition: "opacity 0.4s ease",
              opacity: showResults ? 1 : 0,
              pointerEvents: showResults ? "auto" : "none",
            }}
          >
            <div className="flex items-center justify-between mb-3" style={fi(showResults)}>
              <span className="text-xs font-extrabold text-slate-800">Splan<span className="text-blue-500">AI</span></span>
              <div className="flex gap-1.5">
                <span className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">Share Link ✓</span>
                <span className="px-2 py-1 rounded text-xs bg-blue-500 text-white font-semibold">PDF</span>
              </div>
            </div>

            {/* Neighborhood chips */}
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {HERO_CHIPS.map((c, i) => (
                <div key={c.label} className={`rounded-lg ${c.bg} border ${c.border} p-2 flex items-center gap-1.5`} style={fi(chipVisible, i * 120)}>
                  <span className="text-sm">{c.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{c.label}</p>
                    <p className="text-xs text-slate-400">{c.val}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mortgage bar */}
            <div className="mb-3 rounded-lg bg-slate-800 p-2.5 flex items-center justify-between" style={fi(chipVisible, 360)}>
              <span className="text-xs text-slate-400">Mortgage (20% down, 30yr, ~6.5%)</span>
              <span className="text-sm font-extrabold text-white">$1,876<span className="text-slate-400 text-xs font-normal">/mo</span></span>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-3 gap-2">
              {HERO_PLANS.map((p, i) => (
                <div
                  key={p.id}
                  className={`rounded-xl border-2 bg-white overflow-hidden ${p.selected ? "border-emerald-400 shadow-md" : "border-slate-200"}`}
                  style={fi(planVisible[i])}
                >
                  <div className={`px-2 py-1.5 text-white text-xs font-bold ${p.bgClass}`}>
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
          </div>
        </div>
      </div>

      {/* ── Badge: "Client viewed plan" ───────────────────────────── */}
      <div
        className="absolute -bottom-4 right-0 bg-white rounded-xl shadow-xl border border-slate-100 px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap"
        style={{
          transition: "opacity 0.45s ease, transform 0.45s ease",
          opacity: showBadge ? 1 : 0,
          transform: showBadge ? "translateY(0)" : "translateY(6px)",
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-semibold text-slate-700">Client viewed plan</span>
        <span className="text-xs text-slate-400">just now</span>
      </div>
    </div>
  );
}

interface MlsLotData {
  listingId: string;
  address?: string;
  lotSizeArea?: number;
  lotSizeUnits?: string;
  zoning?: string;
  listPrice?: number;
  city?: string;
  state?: string;
  postalCode?: string;
  mlsProvider?: string;
  attribution?: string;
  disclaimer?: string;
  dataTimestamp?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ lotSize: "", budget: "", familySize: "", city: "", state: "", street: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [mkt, setMkt] = useState<Market>("us");

  // Limit-exceeded modal
  const [limitModal, setLimitModal] = useState<{ plan: 'free' | 'pro' | 'team'; current: number; limit: number; upgradePath: string } | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // MLS state
  const [mlsConnected, setMlsConnected] = useState(false);
  const [mlsListingId, setMlsListingId] = useState("");
  const [mlsLotData, setMlsLotData] = useState<MlsLotData | null>(null);
  const [mlsFetching, setMlsFetching] = useState(false);
  const [mlsFetchError, setMlsFetchError] = useState<string | null>(null);

  const t = T[lang];
  const supabase = createClient();
  const pack = getMarketPack(mkt);
  const lotSizeMin = pack.areaUnit === "m2" ? 50 : 1000;
  const lotSizeLabel = mkt === "us" ? t.form.lotLabel : pack.vocab.lotSizeLabel;
  const budgetLabel = mkt === "us" ? t.form.budgetLabel : pack.vocab.budgetLabel;
  const stateLabel = mkt === "us" ? t.form.stateLabel : pack.vocab.stateLabel;
  const lotSizePlaceholder = mkt === "us" ? t.form.lotPlaceholder : pack.areaUnit === "m2" ? "e.g. 650" : t.form.lotPlaceholder;
  const budgetPlaceholder = mkt === "us" ? t.form.budgetPlaceholder : pack.currency === "CAD" ? "e.g. 500000" : "e.g. 850000";
  const storedFormFrom = (data: { normalizedInput?: { lotSize?: unknown } }) => {
    const normalizedLotSize = data.normalizedInput?.lotSize;
    return typeof normalizedLotSize === "number" && Number.isFinite(normalizedLotSize)
      ? { ...form, lotSize: String(normalizedLotSize) }
      : form;
  };

  useEffect(() => {
    setMkt(marketFromHost(window.location.host) ?? "us");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user) {
        // Check MLS connection status
        fetch("/api/mls/status")
          .then(r => r.json())
          .then((d: { connected: boolean }) => setMlsConnected(d.connected))
          .catch(() => {});
      }
    });
  }, [supabase]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleMlsFetch() {
    if (!mlsListingId.trim()) return;
    setMlsFetching(true);
    setMlsFetchError(null);
    setMlsLotData(null);
    try {
      const res = await fetch(`/api/mls/lot-data?provider=us-trestle&listingId=${encodeURIComponent(mlsListingId.trim())}`);
      const data = await res.json() as MlsLotData & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "MLS lookup failed");
      setMlsLotData(data);
      // Auto-fill form fields from MLS data
      setForm(prev => ({
        ...prev,
        lotSize: data.lotSizeArea ? String(Math.round(data.lotSizeArea)) : prev.lotSize,
        city:    data.city    ?? prev.city,
        state:   data.state   ?? prev.state,
      }));
    } catch (err) {
      setMlsFetchError(err instanceof Error ? err.message : "MLS data unavailable. Enter details manually.");
    } finally {
      setMlsFetching(false);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = {
        ...form,
        ...(mkt !== "us" ? { market: mkt } : {}),
        ...(mlsLotData?.zoning ? { mlsZoning: mlsLotData.zoning } : {}),
      };
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 429 && data.code === "LIMIT_EXCEEDED") {
        setLimitModal({ plan: data.plan as 'free' | 'pro' | 'team', current: data.current, limit: data.limit, upgradePath: data.upgradePath as string });
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      const storedForm = storedFormFrom(data);
      sessionStorage.setItem("floorPlans", JSON.stringify(data.plans));
      sessionStorage.setItem("formData", JSON.stringify(storedForm));
      if (form.city && form.state) sessionStorage.setItem("location", JSON.stringify({ city: form.city, state: form.state }));
      else sessionStorage.removeItem("location");
      if (mlsLotData) sessionStorage.setItem("mlsData", JSON.stringify(mlsLotData));
      else sessionStorage.removeItem("mlsData");
      track("generate_success");
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plans");
      setLoading(false);
    }
  }

  const isValid = form.lotSize && form.budget && form.familySize;

  const [teamCheckoutLoading, setTeamCheckoutLoading] = useState(false);
  async function handleLPTeamCTA() {
    if (!userEmail) { window.location.href = "/login?plan=team"; return; }
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
    window.location.href = "/login?plan=team";
    setTeamCheckoutLoading(false);
  }

  async function handleUpgradeFromModal(upgradePath: string) {
    if (upgradePath === 'custom') { window.location.href = CUSTOM_PLAN_MAILTO; return; }
    setUpgradeLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: upgradePath }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fall through */ }
    window.location.href = upgradePath === 'team' ? '/login?plan=team' : '/login?plan=pro';
    setUpgradeLoading(false);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">

      {/* ── 1. Nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-900">
        <div className="relative max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-extrabold tracking-tight text-white shrink-0">
            Splan<span className="text-blue-400">AI</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400 absolute left-1/2 -translate-x-1/2">
            <a href="#how" className="hover:text-white transition-colors">{t.nav.how}</a>
            <a href="#pricing" className="hover:text-white transition-colors">{t.nav.pricing}</a>
            <a href="#reviews" className="hover:text-white transition-colors">{t.nav.reviews}</a>
            <a href="/blog" className="hover:text-white transition-colors">{t.nav.blog}</a>
          </nav>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <button
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              aria-label={lang === "en" ? "Cambiar idioma a español" : "Switch language to English"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
              {lang === "en" ? "ES" : "EN"}
            </button>
            {userEmail ? (
              <a href="/dashboard" className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.dashboard}</a>
            ) : (
              <a href="/login" className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">{t.nav.signin}</a>
            )}
            <a href="#generate" className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
              onClick={() => track("cta_click", { button: "nav_cta" })}
            >{t.nav.cta}</a>
          </div>
        </div>
      </header>

      {/* ── 2. Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 text-center lg:text-left max-w-xl mx-auto lg:mx-0">
              <ProductHuntBadge state="post-launch" lang={lang} />
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-balance text-white mb-5">
                {t.hero.headline1}{" "}
                <span className="text-blue-400">{t.hero.headline2}</span>
              </h1>
              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-lg">{t.hero.sub}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-10">
                <a href="#generate" className="px-7 py-4 rounded-xl text-white font-bold text-base bg-blue-500 hover:bg-blue-600 shadow-[0_0_30px_rgba(59,130,246,0.35)] transition-colors"
                  onClick={() => track("cta_click", { button: "hero_primary" })}
                >{t.hero.ctaPrimary}</a>
                <a href="#how" className="px-7 py-4 rounded-xl font-semibold text-base border-2 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-all">
                  {t.hero.ctaSecondary}
                </a>
              </div>
              <p className="-mt-6 mb-10 text-center lg:text-left">
                <a href="/try" className="text-sm text-slate-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
                  onClick={() => track("cta_click", { button: "hero_try_demo" })}
                >{t.hero.tryDemo}</a>
              </p>
              <div className="flex items-center gap-8 justify-center lg:justify-start">
                {[t.hero.stat1, t.hero.stat2, t.hero.stat3].map((s, i) => (
                  <div key={i} className="text-center lg:text-left">
                    <p className="text-2xl font-extrabold text-white">{s.value}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 w-full lg:max-w-lg">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3a. Social Proof Bar ─────────────────────────────────────── */}
      <SocialProofBar lang={lang} />

      {/* ── 3. Trust Bar ────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 py-5 px-6 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-5 justify-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">{t.trust.label}</span>
          <div className="w-px h-4 bg-slate-200 hidden sm:block" />
          <div className="flex flex-wrap items-center justify-center gap-8">
            {[
              { name: "Google Maps", sub: "Places & Geocoding" },
              { name: "RentCast", sub: "Market Data" },
              { name: "FRED", sub: "Mortgage Rates" },
              { name: "Anthropic Claude", sub: "AI Generation" },
              { name: "Stripe", sub: "Payments" },
              { name: "Supabase", sub: "Database" },
            ].map(tech => (
              <div key={tech.name} className="opacity-70 hover:opacity-100 transition-opacity">
                <p className="text-sm font-bold text-slate-700 leading-none">{tech.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{tech.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Generate Form ────────────────────────────────────────────── */}
      <section id="generate" className="py-16 px-6 scroll-mt-[64px] bg-slate-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.form.title}</p>
            <p className="mt-2 text-sm text-slate-400">{t.form.signupNote}</p>
          </div>
          <form onSubmit={handleSubmit} className="bg-white border-2 border-slate-200 rounded-2xl shadow-xl p-8">
            {/* MLS Listing # — only shown when connected */}
            {mkt === "us" && mlsConnected && (
              <div className="mb-5 p-4 rounded-xl bg-blue-50 border border-blue-200">
                <label className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-2">
                  MLS Listing # <span className="text-blue-400 font-normal">(optional — auto-fills lot data)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mlsListingId}
                    onChange={e => { setMlsListingId(e.target.value); setMlsLotData(null); setMlsFetchError(null); }}
                    placeholder="e.g. 1234567"
                    className="flex-1 px-4 py-2.5 rounded-xl border-2 border-blue-200 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-500 transition text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleMlsFetch}
                    disabled={!mlsListingId.trim() || mlsFetching}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {mlsFetching ? "…" : "Fetch"}
                  </button>
                </div>
                {mlsLotData && (
                  <p className="mt-2 text-xs text-emerald-700 font-semibold">
                    ✓ Lot data loaded from MLS — {mlsLotData.address ?? mlsLotData.listingId}
                  </p>
                )}
                {mlsFetchError && (
                  <p className="mt-2 text-xs text-amber-700">{mlsFetchError}</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { label: lotSizeLabel, name: "lotSize", type: "number", placeholder: lotSizePlaceholder, min: lotSizeMin },
                { label: budgetLabel, name: "budget", type: "number", placeholder: budgetPlaceholder, min: 50000 },
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
                    placeholder={mkt === "us" ? t.form.cityPlaceholder : pack.vocab.cityPlaceholder} maxLength={60}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{stateLabel}</label>
                  <input type="text" name="state" value={form.state} onChange={handleChange}
                    placeholder={mkt === "us" ? t.form.statePlaceholder : pack.vocab.statePlaceholder} maxLength={30}
                    className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm" />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-400">{t.form.streetLabel}</label>
                <input type="text" name="street" value={form.street} onChange={handleChange}
                  placeholder={mkt === "us" ? t.form.streetPlaceholder : pack.vocab.streetPlaceholder} maxLength={120}
                  className="w-full mt-1.5 px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm" />
                <p className="text-xs text-slate-500 mt-1">{t.form.streetHint}</p>
              </div>
            </div>
            {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{error}</p>}
            <button type="submit" disabled={!isValid || loading}
              className={`mt-6 w-full py-4 rounded-xl text-white text-base font-bold transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg ${loading ? "bg-blue-700" : isValid ? "bg-blue-500 hover:bg-blue-600" : "bg-slate-400"}`}>
              {loading ? <><Spinner />Generating proposals… (~30 sec)</> : t.form.cta}
            </button>
          </form>
          <p className="mt-4 text-xs text-center text-slate-400">{t.form.disclaimer}</p>
        </div>
      </section>

      {/* ── 4. Pain Points ──────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <AnimateIn className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.pain.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.pain.sub}</p>
          </AnimateIn>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.pain.items.map((item, i) => (
              <AnimateIn key={i} delay={i * 90}>
                <div className="rounded-2xl p-7 border border-slate-200 bg-slate-50 flex flex-col gap-3 h-full">
                  <Icon name={PAIN_ICONS[i]} className="w-7 h-7 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base leading-snug">{item.headline}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">{item.body}</p>
                  <p className="text-blue-600 text-sm font-bold border-t border-slate-200 pt-4">→ {item.solution}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
          <AnimateIn delay={200} className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 text-white px-8 py-4 rounded-2xl shadow-xl bg-slate-900">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-semibold">
                {lang === "en" ? "SplanAI solves all three — in 30 seconds." : "SplanAI resuelve los tres — en 30 segundos."}
              </span>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── 5. How It Works ─────────────────────────────────────────── */}
      <section id="how" className="py-20 px-6 bg-slate-900">
        <div className="max-w-5xl mx-auto">
          <AnimateIn className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance text-white mb-4">{t.how.heading}</h2>
          </AnimateIn>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
            {t.how.steps.map((step, i) => (
              <AnimateIn key={step.step} delay={i * 100}>
              <div className="relative">
                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/40 bg-blue-500/15">
                      <Icon name={HOW_ICONS[i]} className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">{step.step}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base mb-1">{step.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </div>
              </AnimateIn>
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
                  <span className="text-xs text-slate-500 font-mono">splanai.com/results</span>
                </div>
              </div>
              <div className="p-5 bg-slate-50">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-slate-800">Splan<span className="text-blue-500">AI</span></span>
                    <span className="hidden sm:inline text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">8,500 sqft · $450K · 4 people · Austin, TX</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">Share Link</button>
                    <button className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: "#3B82F6" }}>Export PDF</button>
                  </div>
                </div>
                {/* Neighborhood context first — mirrors Hero resequencing (per @DesignByMaeL) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
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
                <div className="rounded-xl p-3 flex items-center justify-between border border-slate-200 bg-white mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>🏦</span> Mortgage est. <span className="font-semibold text-slate-800">$1,876/mo</span>
                    <span className="text-xs text-slate-400">(20% down · 30yr · ~6.5%)</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full text-emerald-700 font-semibold" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>Live</span>
                </div>
                {/* AI-generated plans shown after lot context is established */}
                <div className="grid grid-cols-3 gap-3">
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Differentiators ──────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <AnimateIn className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.diff.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.diff.sub}</p>
          </AnimateIn>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.diff.items.map((item, i) => (
              <AnimateIn key={item.title} delay={i * 90}>
                <div className="flex flex-col gap-4 p-7 rounded-2xl border border-slate-200 bg-slate-50 hover:border-blue-200 transition-colors h-full">
                  <Icon name={DIFF_ICONS[i]} className="w-7 h-7 text-blue-600" />
                  <h3 className="text-lg font-bold" style={{ color: "#0F172A" }}>{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Mission ──────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <AnimateIn className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance text-white mb-6 leading-tight">{t.mission.heading}</h2>
          <p className="text-slate-400 text-lg leading-relaxed">{t.mission.body}</p>
        </AnimateIn>
      </section>

      {/* ── 8. Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-ink-deep">
        <div className="max-w-6xl mx-auto">
          <AnimateIn className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-white">{t.pricing.heading}</h2>
            <p className="text-slate-400">{t.pricing.sub}</p>
          </AnimateIn>
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
              <a href="/login?tab=signup" className="block text-center py-3 rounded-xl border border-slate-600 font-bold text-slate-300 hover:border-slate-400 hover:text-white transition-all text-sm">
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
              <a href="/login?tab=signup" className="block text-center py-3 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors shadow-lg text-sm"
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
              >{teamCheckoutLoading ? t.modal.redirecting : t.pricing.team.cta}</button>
            </div>

            {/* Custom — sales-led, no price shown */}
            <div className="rounded-2xl p-7 flex flex-col gap-5 border border-slate-600/60 bg-slate-900">
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
              <>Subject to our <a href="/terms#fair-use" className="underline hover:text-white transition-colors">Fair Use Policy</a>.</>
            ) : (
              <>Sujeto a nuestra <a href="/terms#fair-use" className="underline hover:text-white transition-colors">Política de Uso Justo</a>.</>
            )}
          </p>
        </div>
      </section>

      {/* ── 9. FAQ ──────────────────────────────────────────────────── */}
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

      {/* ── 10. Security ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <AnimateIn>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.security.heading}</h2>
            <p className="text-slate-500 mb-12">{t.security.sub}</p>
          </AnimateIn>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.security.items.map((item, i) => (
              <AnimateIn key={i} delay={i * 80}>
                <div className="flex flex-col items-center gap-4 p-7 rounded-2xl border border-slate-200 bg-white h-full">
                  <Icon name={SECURITY_ICONS[i]} className="w-7 h-7 text-blue-600" />
                  <p className="text-slate-700 text-sm font-semibold leading-relaxed text-center">{item.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 11. What You Get ────────────────────────────────────────── */}
      <section id="reviews" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <AnimateIn className="text-center mb-12">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">{t.wyg.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance mb-3 text-slate-900">{t.wyg.heading}</h2>
            <p className="text-slate-500 max-w-xl mx-auto">{t.wyg.sub}</p>
            <p className="mt-2 text-xs text-slate-400 max-w-sm mx-auto">{t.wyg.note}</p>
          </AnimateIn>

          {/* Step 1 — 3 AI-generated plans */}
          <AnimateIn delay={80} className="mb-6">
            <div className="rounded-2xl border-2 border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <p className="font-bold text-slate-800 text-sm">{t.wyg.s1Title}</p>
                <span className="ml-auto text-xs text-slate-400 font-mono shrink-0">{t.wyg.sec}</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    { name: "The Ridgewood Craftsman", style: "Craftsman Bungalow", sqft: "2,650", cost: 622500, color: "#3B82F6" },
                    { name: "The Solana Modern", style: "Contemporary Modern", sqft: "2,900", cost: 812000, color: "#10B981" },
                    { name: "The Cloverfield Farmhouse", style: "Modern Farmhouse", sqft: "2,800", cost: 756000, color: "#8B5CF6" },
                  ] as { name: string; style: string; sqft: string; cost: number; color: string }[]).map((p, i) => (
                    <div key={i} className="rounded-xl border-2 overflow-hidden" style={{ borderColor: p.color + "33" }}>
                      <div className="px-4 py-2 text-xs font-bold text-white" style={{ background: p.color }}>Plan {i + 1}</div>
                      <div className="p-4">
                        <p className="font-bold text-slate-800 text-sm leading-snug">{p.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.style}</p>
                        <p className="text-xl font-extrabold text-slate-900 mt-2">
                          ${(p.cost / 1000).toFixed(0)}K–${Math.round(p.cost * 1.1 / 1000)}K
                        </p>
                        <p className="text-xs text-slate-400 italic">{t.wyg.estRange}</p>
                        <p className="text-xs text-slate-400 mt-1">{p.sqft} {t.wyg.sqft}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400 text-right">{t.wyg.s1Foot}</p>
              </div>
            </div>
          </AnimateIn>

          {/* Step 2 — Share client portal */}
          <AnimateIn delay={160} className="mb-6">
            <div className="rounded-2xl border-2 border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <p className="font-bold text-slate-800 text-sm">{t.wyg.s2Title}</p>
              </div>
              <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <p className="text-sm text-slate-600 leading-relaxed flex-1">{t.wyg.s2Body}</p>
                <a href="/s/nfhkewvz" target="_blank" rel="noopener noreferrer"
                  className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  {t.wyg.s2Cta}
                </a>
              </div>
            </div>
          </AnimateIn>

          {/* Step 3 — PDF + MLS */}
          <AnimateIn delay={240}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border-2 border-slate-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  <p className="font-bold text-slate-800 text-sm">{t.wyg.s3aTitle}</p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-600">{t.wyg.s3aBody}</p>
                </div>
              </div>
              <div className="rounded-2xl border-2 border-amber-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-amber-100 bg-amber-50">
                  <span className="w-6 h-6 rounded-full text-slate-900 text-xs font-bold flex items-center justify-center shrink-0 bg-amber-500">PRO</span>
                  <p className="font-bold text-slate-800 text-sm">{t.wyg.s3bTitle}</p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-600">{t.wyg.s3bBody}</p>
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── 12. CTA Banner ──────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <AnimateIn className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-balance text-white mb-5">{t.ctaBanner.heading}</h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">{t.ctaBanner.sub}</p>
          <a href="#generate"
            className="inline-flex items-center gap-3 px-6 sm:px-10 py-5 rounded-2xl text-white text-lg sm:text-xl font-bold bg-blue-500 hover:bg-blue-600 shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-colors"
          >
            {t.ctaBanner.cta}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </AnimateIn>
      </section>

      {/* ── 13. Footer ──────────────────────────────────────────────── */}
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
            <a href="#pricing" className="py-2 hover:text-slate-300 transition-colors">{t.nav.pricing}</a>
            <a href="/terms" className="py-2 hover:text-slate-300 transition-colors">Terms</a>
            <a href="/privacy" className="py-2 hover:text-slate-300 transition-colors">Privacy</a>
            <a href="/login" className="py-2 hover:text-slate-300 transition-colors">{t.nav.signin}</a>
          </div>
        </div>
      </footer>

      {/* ── Limit-exceeded modal ─────────────────────────────────────── */}
      {limitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
            <button onClick={() => setLimitModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none">✕</button>

            {limitModal.plan === 'free' ? (
              <>
                <h2 className="text-xl font-bold text-slate-900 mb-2">{t.modal.freeTitle}</h2>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">{t.modal.freeBody}</p>
                <button
                  onClick={() => handleUpgradeFromModal('pro')}
                  disabled={upgradeLoading}
                  className="w-full py-3 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-60"
                >
                  {upgradeLoading ? t.modal.redirecting : t.modal.freeCta}
                </button>
              </>
            ) : limitModal.plan === 'pro' ? (
              <>
                <h2 className="text-xl font-bold text-slate-900 mb-2">{t.modal.proTitle}</h2>
                <p className="text-slate-500 mb-4 text-sm leading-relaxed">{t.modal.proBody}</p>
                <button
                  onClick={() => handleUpgradeFromModal('team')}
                  disabled={upgradeLoading}
                  className="w-full py-3 rounded-xl font-bold text-slate-900 bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-60 mb-3"
                >
                  {upgradeLoading ? t.modal.redirecting : t.modal.proCta}
                </button>
                <a href="mailto:hello@splanai.com" className="block text-center text-sm text-slate-400 hover:text-slate-700 transition-colors">
                  {t.modal.proSecondary}
                </a>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-900 mb-2">{t.modal.otherTitle}</h2>
                <p className="text-slate-500 mb-6 text-sm leading-relaxed">{t.modal.otherBody}</p>
                <a href="mailto:hello@splanai.com" className="block text-center py-3 rounded-xl font-bold text-blue-600 border border-blue-600 hover:bg-blue-50 transition-colors">
                  {t.modal.otherCta}
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
