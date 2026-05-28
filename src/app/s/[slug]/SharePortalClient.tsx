"use client";

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";

function calcMonthly(homePrice: number, downPct: number, ratePct: number, termYears: number): number {
  const principal = homePrice * (1 - downPct / 100);
  const r = ratePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

function MortgageWidget({ homePrice }: { homePrice: number }) {
  const monthly = calcMonthly(homePrice, 20, 7.0, 30);
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-0.5">Mortgage Est.</p>
        <p className="text-xl font-extrabold text-blue-700">${monthly.toLocaleString()}<span className="text-sm font-normal text-blue-400">/mo</span></p>
        <p className="text-xs text-blue-400 mt-0.5">20% down · 30yr · 7%</p>
      </div>
      <span className="text-2xl">🏦</span>
    </div>
  );
}

interface Room {
  name: string;
  sqft: number;
}

interface FloorPlan {
  id: number;
  name: string;
  style: string;
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  stories: number;
  estimatedCost: number;
  description: string;
  features: string[];
  rooms: Room[];
  highlights: string[];
}

const PLAN_COLORS: [number, number, number][] = [
  [37, 99, 235],
  [16, 185, 129],
  [124, 58, 237],
];

const STYLE_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-600", accent: "text-blue-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-600", accent: "text-emerald-700" },
  { bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-600", accent: "text-violet-700" },
];

const T = {
  en: {
    title: "Your Floor Plan Proposals",
    subtitle: "Prepared exclusively for you",
    poweredBy: "Powered by",
    download: "Download PDF",
    downloadAll: "Download All Plans (PDF)",
    viewedBy: "Prepared for",
    sqft: "Sq Ft",
    beds: "Beds",
    baths: "Baths",
    stories: "Stories",
    features: "Features",
    rooms: "Room Breakdown",
    highlights: "Key Highlights",
    expand: "Click to expand details",
    cost: "estimated cost",
    contact: "Questions? Contact your builder.",
  },
  es: {
    title: "Sus Propuestas de Planos",
    subtitle: "Preparado exclusivamente para usted",
    poweredBy: "Desarrollado por",
    download: "Descargar PDF",
    downloadAll: "Descargar Todos los Planos (PDF)",
    viewedBy: "Preparado para",
    sqft: "Pies²",
    beds: "Hab.",
    baths: "Baños",
    stories: "Pisos",
    features: "Características",
    rooms: "Distribución",
    highlights: "Puntos Clave",
    expand: "Clic para ver detalles",
    cost: "costo estimado",
    contact: "¿Preguntas? Comuníquese con su constructor.",
  },
  zh: {
    title: "您的户型方案",
    subtitle: "专为您精心准备",
    poweredBy: "技术支持",
    download: "下载PDF",
    downloadAll: "下载全部方案 (PDF)",
    viewedBy: "专为您准备",
    sqft: "平方英尺",
    beds: "卧室",
    baths: "浴室",
    stories: "层数",
    features: "主要特点",
    rooms: "房间分布",
    highlights: "核心亮点",
    expand: "点击查看详情",
    cost: "预估造价",
    contact: "有疑问？请联系您的建筑商。",
  },
} as const;

type Lang = keyof typeof T;

const LANG_CYCLE: Lang[] = ["en", "es", "zh"];
const LANG_META: Record<Lang, { flag: string; label: string }> = {
  en: { flag: "🇺🇸", label: "EN" },
  es: { flag: "🇲🇽", label: "ES" },
  zh: { flag: "🇨🇳", label: "中文" },
};

async function buildPDF(plans: FloorPlan[], lang: Lang): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297, ML = 20, CW = PW - ML * 2;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let logoBase64: string | null = null;
  try {
    const res = await fetch("/logo.png");
    const blob = await res.blob();
    logoBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { /* fallback to text */ }

  plans.forEach((plan, pi) => {
    if (pi > 0) doc.addPage();
    const [cr, cg, cb] = PLAN_COLORS[pi % PLAN_COLORS.length];

    const HEADER_H = 28;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PW, HEADER_H, "F");
    doc.setDrawColor(220, 220, 220);
    doc.line(0, HEADER_H, PW, HEADER_H);

    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", ML, 2, 80, 24);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text("SplanAI", ML, HEADER_H / 2 + 2);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(dateStr, PW - ML, HEADER_H / 2 - 1, { align: "right" });
    doc.text(`Plan ${pi + 1} of ${plans.length}`, PW - ML, HEADER_H / 2 + 5, { align: "right" });

    const BADGE_Y = HEADER_H + 10, BADGE_H = 9, BADGE_W = 30;
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(ML, BADGE_Y, BADGE_W, BADGE_H, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`PLAN ${plan.id}`, ML + BADGE_W / 2, BADGE_Y + BADGE_H / 2 + 1, { align: "center" });

    let y = BADGE_Y + BADGE_H + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(17, 24, 39);
    doc.text(plan.name, ML, y);

    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(plan.style, ML, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(cr, cg, cb);
    doc.text(`$${plan.estimatedCost.toLocaleString()}`, PW - ML, y, { align: "right" });

    y += 8;
    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 4;

    const stats = [
      { label: T[lang].sqft, value: plan.squareFootage.toLocaleString() },
      { label: T[lang].beds, value: String(plan.bedrooms) },
      { label: T[lang].baths, value: String(plan.bathrooms) },
      { label: T[lang].stories, value: String(plan.stories) },
    ];
    const sw = CW / 4;
    stats.forEach((stat, si) => {
      const sx = ML + si * sw;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(17, 24, 39);
      doc.text(stat.value, sx + sw / 2, y + 10, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(stat.label, sx + sw / 2, y + 17, { align: "center" });
      if (si < 3) { doc.setDrawColor(229, 231, 235); doc.line(sx + sw, y + 1, sx + sw, y + 21); }
    });

    y += 26;
    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("DESCRIPTION", ML, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    const descLines = doc.splitTextToSize(plan.description, CW) as string[];
    doc.text(descLines, ML, y);
    y += descLines.length * 5.5 + 8;

    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(T[lang].highlights.toUpperCase(), ML, y);
    y += 6;
    plan.highlights.forEach((h) => {
      const hLines = doc.splitTextToSize(h, CW - 7) as string[];
      doc.setFillColor(cr, cg, cb);
      doc.circle(ML + 2, y - 1.5, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text(hLines, ML + 7, y);
      y += hLines.length * 5.5 + 1.5;
    });

    y += 3;
    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(T[lang].rooms.toUpperCase(), ML, y);
    y += 6;
    const roomColW = CW / 2 - 3;
    plan.rooms.forEach((room, ri) => {
      const col = ri % 2, row = Math.floor(ri / 2);
      const rx = ML + col * (CW / 2), ry = y + row * 9;
      doc.setFillColor(249, 250, 251);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(rx, ry - 4, roomColW, 7, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      doc.text(room.name, rx + 4, ry);
      doc.setTextColor(107, 114, 128);
      doc.text(`${room.sqft} sqft`, rx + roomColW - 4, ry, { align: "right" });
    });

    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 14, PW, 14, "F");
    doc.setDrawColor(229, 231, 235);
    doc.line(0, PH - 14, PW, PH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Powered by SplanAI · Data: Google Maps + RentCast · splanai.com", ML, PH - 9);
    doc.text(`© ${new Date().getFullYear()} SplanAI`, PW - ML, PH - 9, { align: "right" });
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180);
    doc.text("Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them.", ML, PH - 4);
  });

  return doc;
}

interface Props {
  slug: string;
  plans: FloorPlan[];
  clientName: string | null;
  expiresAt: string | null;
}

export default function SharePortalClient({ slug, plans, clientName, expiresAt }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const t = T[lang];

  // Record 'view' event on mount
  useEffect(() => {
    fetch("/api/share/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, eventType: "view" }),
    }).catch(() => {});
  }, [slug]);

  async function downloadZH(targetPlans: FloorPlan[], filename: string) {
    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planData: targetPlans, language: "zh" }),
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadAll() {
    setPdfLoading(true);
    try {
      if (lang === "zh") {
        await downloadZH(plans, "SplanAI-Floor-Plans-ZH.pdf");
      } else {
        const doc = await buildPDF(plans, lang);
        doc.save("SplanAI-Floor-Plans.pdf");
      }
      fetch("/api/share/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, eventType: "pdf_download" }),
      }).catch(() => {});
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadOne(plan: FloorPlan) {
    const filename = `SplanAI-${plan.name.replace(/\s+/g, "-")}${lang === "zh" ? "-ZH" : ""}.pdf`;
    if (lang === "zh") {
      await downloadZH([plan], filename);
    } else {
      const doc = await buildPDF([plan], lang);
      doc.save(filename);
    }
    fetch("/api/share/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, eventType: "pdf_download", planIndex: plan.id - 1 }),
    }).catch(() => {});
  }

  function handlePlanExpand(planId: number) {
    setSelectedPlan(selectedPlan === planId ? null : planId);
    if (selectedPlan !== planId) {
      fetch("/api/share/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, eventType: "plan_selected", planIndex: planId - 1 }),
      }).catch(() => {});
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="https://splanai.com" className="text-xl font-bold tracking-tight text-gray-900 hover:opacity-80 transition-opacity">
            Splan<span className="text-blue-600">AI</span>
          </a>

          <div className="flex items-center gap-3">
            {/* Expiry notice */}
            {expiresAt && (
              <span className="hidden sm:inline text-xs text-gray-400">
                Expires {new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            {/* Language toggle — cycles EN → ES → ZH → EN */}
            <button
              onClick={() => setLang(LANG_CYCLE[(LANG_CYCLE.indexOf(lang) + 1) % LANG_CYCLE.length])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <span className="text-base leading-none">{LANG_META[LANG_CYCLE[(LANG_CYCLE.indexOf(lang) + 1) % LANG_CYCLE.length]].flag}</span>
              {LANG_META[LANG_CYCLE[(LANG_CYCLE.indexOf(lang) + 1) % LANG_CYCLE.length]].label}
            </button>

            <button
              onClick={handleDownloadAll}
              disabled={pdfLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {pdfLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {t.downloadAll}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900">{t.title}</h1>
          {clientName && (
            <p className="mt-2 text-gray-500">{t.viewedBy}: <span className="font-medium text-gray-800">{clientName}</span></p>
          )}
          <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan, i) => {
            const colors = STYLE_COLORS[i % STYLE_COLORS.length];
            const isSelected = selectedPlan === plan.id;

            return (
              <div
                key={plan.id}
                onClick={() => handlePlanExpand(plan.id)}
                className={`rounded-2xl border-2 bg-white cursor-pointer transition-all duration-200 overflow-hidden ${
                  isSelected
                    ? `${colors.border} shadow-xl scale-[1.02]`
                    : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
                }`}
              >
                {/* Card header */}
                <div className={`${colors.bg} px-6 py-5 border-b ${colors.border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-block text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white ${colors.badge} mb-2`}>
                        Plan {plan.id}
                      </span>
                      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                      <p className={`text-sm font-medium ${colors.accent} mt-0.5`}>{plan.style}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-extrabold text-gray-900">${(plan.estimatedCost / 1000).toFixed(0)}K</p>
                      <p className="text-xs text-gray-500">{t.cost}</p>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { label: t.sqft, value: plan.squareFootage.toLocaleString() },
                    { label: t.beds, value: plan.bedrooms },
                    { label: t.baths, value: plan.bathrooms },
                    { label: t.stories, value: plan.stories },
                  ].map((stat) => (
                    <div key={stat.label} className="px-3 py-3 text-center">
                      <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-500">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <div className="px-6 py-4">
                  <p className="text-sm text-gray-600 leading-relaxed">{plan.description}</p>
                </div>

                {/* Highlights */}
                <div className="px-6 pb-4">
                  <ul className="space-y-1.5">
                    {plan.highlights.map((h, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                        <svg className={`w-4 h-4 mt-0.5 shrink-0 ${colors.accent}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className={`border-t ${colors.border} ${colors.bg} px-6 py-5`}>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{t.features}</h3>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {plan.features.map((f, j) => (
                        <span key={j} className="px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700 font-medium shadow-sm">
                          {f}
                        </span>
                      ))}
                    </div>

                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{t.rooms}</h3>
                    <div className="grid grid-cols-2 gap-1.5 mb-5">
                      {plan.rooms.map((room, j) => (
                        <div key={j} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 text-xs border border-gray-100">
                          <span className="text-gray-700 font-medium">{room.name}</span>
                          <span className="text-gray-500">{room.sqft} sqft</span>
                        </div>
                      ))}
                    </div>

                    <MortgageWidget homePrice={plan.estimatedCost} />

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadOne(plan); }}
                      className={`w-full mt-4 py-3 rounded-xl text-white text-sm font-semibold ${colors.badge} hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {t.download}
                    </button>
                  </div>
                )}

                {!isSelected && (
                  <div className="px-6 pb-5">
                    <p className="text-xs text-center text-gray-400">{t.expand}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center border-t border-gray-100 pt-8">
          <p className="text-xs text-gray-400 italic mb-5 max-w-xl mx-auto">
            AI-generated concept — illustration only. Not an architectural or engineering plan. Verify with a licensed professional before construction.
          </p>
          <p className="text-sm text-gray-400 mb-4">{t.contact}</p>
          <a href="https://splanai.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 transition-colors">
            <span className="text-base font-extrabold tracking-tight">Splan<span className="text-blue-500">AI</span></span>
          </a>
          <p className="text-xs text-gray-300 mt-1">{t.poweredBy} SplanAI · splanai.com</p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-300">
            <a href="https://splanai.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">Terms</a>
            <a href="https://splanai.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
