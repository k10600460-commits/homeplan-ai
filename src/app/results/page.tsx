"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";

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

interface FormData {
  lotSize: string;
  budget: string;
  familySize: string;
  city?: string;
  state?: string;
}

interface PlaceInfo {
  name: string;
  rating?: number | null;
  vicinity?: string | null;
  distanceKm?: number | null;
}

interface SafetyInfo {
  score: number;
  policeStations: number;
  fireStations: number;
  label: 'High' | 'Moderate' | 'Low';
}

interface NeighborhoodData {
  available: boolean;
  nearingLimit?: boolean;
  reason?: string;
  city?: string;
  state?: string;
  schools?: PlaceInfo[];
  hospitals?: PlaceInfo[];
  groceries?: PlaceInfo[];
  safety?: SafetyInfo;
}

interface MarketData {
  available: boolean;
  nearingLimit?: boolean;
  reason?: string;
  city?: string;
  state?: string;
  averageRent?: number | null;
  medianRent?: number | null;
  averageSalePrice?: number | null;
  medianSalePrice?: number | null;
}

// ── Mortgage calculator ───────────────────────────────────────────────
interface MortgageInputs {
  homePrice: number;
  downPct: number;   // 0-100
  ratePct: number;   // annual %, e.g. 7.0
  termYears: number; // 15 or 30
}

interface MortgageResult {
  monthlyPayment: number;
  principal: number;
  totalInterest: number;
  totalCost: number;
  downAmount: number;
}

function calcMortgage(inputs: MortgageInputs): MortgageResult {
  const downAmount = inputs.homePrice * (inputs.downPct / 100);
  const principal  = inputs.homePrice - downAmount;
  const r          = inputs.ratePct / 100 / 12;
  const n          = inputs.termYears * 12;
  const monthly    = r === 0
    ? principal / n
    : principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalCost  = monthly * n;
  return {
    monthlyPayment: Math.round(monthly),
    principal:      Math.round(principal),
    totalInterest:  Math.round(totalCost - principal),
    totalCost:      Math.round(totalCost),
    downAmount:     Math.round(downAmount),
  };
}

function MortgageCalculator({ homePrice }: { homePrice: number }) {
  const [downPct, setDownPct]     = useState(20);
  const [ratePct, setRatePct]     = useState(7.0);
  const [termYears, setTermYears] = useState(30);

  const result = calcMortgage({ homePrice, downPct, ratePct, termYears });
  const fmt    = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5 flex items-center gap-2">
        <span className="text-lg">🏦</span> Mortgage Calculator
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Down payment */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Down Payment</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={3} max={50} step={1} value={downPct}
              onChange={e => setDownPct(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm font-bold text-gray-800 w-10 text-right">{downPct}%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{fmt(result.downAmount)}</p>
        </div>

        {/* Interest rate */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Interest Rate</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={3} max={12} step={0.1} value={ratePct}
              onChange={e => setRatePct(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm font-bold text-gray-800 w-12 text-right">{ratePct.toFixed(1)}%</span>
          </div>
        </div>

        {/* Loan term */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Loan Term</label>
          <div className="flex gap-2">
            {[15, 20, 30].map(y => (
              <button
                key={y}
                onClick={() => setTermYears(y)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  termYears === y
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 text-gray-600 hover:border-blue-400"
                }`}
              >
                {y}yr
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-blue-50 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div className="text-center">
          <p className="text-xl font-extrabold text-blue-700 truncate">{fmt(result.monthlyPayment)}</p>
          <p className="text-xs text-blue-500 mt-0.5">/ month</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800 truncate">{fmt(result.principal)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Loan Amount</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800 truncate">{fmt(result.totalInterest)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Interest</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800 truncate">{fmt(result.totalCost)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Cost</p>
        </div>
      </div>
      <p className="text-xs text-gray-300 mt-2 text-right">Estimate only · Taxes & insurance not included</p>
    </div>
  );
}

const PLAN_COLORS: [number, number, number][] = [
  [37, 99, 235],   // blue-600
  [16, 185, 129],  // emerald-500
  [124, 58, 237],  // violet-600
];

const STYLE_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-600", accent: "text-blue-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-600", accent: "text-emerald-700" },
  { bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-600", accent: "text-violet-700" },
];

async function buildPDF(plans: FloorPlan[], formData: FormData | null, whiteLabelOptions?: { enabled: boolean; companyName: string }): Promise<jsPDF> {
  const whiteLabel = whiteLabelOptions?.enabled ?? false;
  const companyLabel = whiteLabelOptions?.companyName?.trim() || "Your Builder";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PW = 210;   // page width
  const PH = 297;   // page height
  const ML = 20;    // margin left/right
  const CW = PW - ML * 2;  // content width

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Fetch logo once and convert to Base64
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
  } catch {
    // Logo fetch failed — fall back to text
  }

  plans.forEach((plan, pi) => {
    if (pi > 0) doc.addPage();

    const [cr, cg, cb] = PLAN_COLORS[pi % PLAN_COLORS.length];

    // ── Header bar (white with bottom border) ─────────────────
    const HEADER_H = 28;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PW, HEADER_H, "F");
    doc.setDrawColor(220, 220, 220);
    doc.line(0, HEADER_H, PW, HEADER_H);

    // Logo: 70×21mm, top at y=4.5 — visually centred in 28mm header
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", ML, 2, 80, 24);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text(whiteLabel ? companyLabel : "SplanAI", ML, HEADER_H / 2 + 2);
    }

    // Right side: date + page number in dark grey
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(dateStr, PW - ML, HEADER_H / 2 - 1, { align: "right" });
    doc.text(`Plan ${pi + 1} of ${plans.length}`, PW - ML, HEADER_H / 2 + 5, { align: "right" });

    // ── Plan badge (independent row, 9pt text, vertically centred) ──
    const BADGE_FONT = 9;   // pt
    const BADGE_H    = 9;   // mm — tall enough for 9pt text with padding
    const BADGE_W    = 30;  // mm
    const BADGE_Y    = HEADER_H + 10;  // top edge of badge

    // Baseline for 9pt text centred inside badge:
    // cap-height ≈ 9pt × 0.353mm/pt × 0.65 ≈ 2.1mm  →  offset = badgeH/2 + 1.0
    const BADGE_TEXT_Y = BADGE_Y + BADGE_H / 2 + 1.0;

    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(ML, BADGE_Y, BADGE_W, BADGE_H, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(BADGE_FONT);
    doc.setTextColor(255, 255, 255);
    doc.text(`PLAN ${plan.id}`, ML + BADGE_W / 2, BADGE_TEXT_Y, { align: "center" });

    // Plan name: 6mm gap below badge bottom
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

    if (formData) {
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Lot: ${Number(formData.lotSize).toLocaleString()} sq ft  ·  Budget: $${Number(formData.budget).toLocaleString()}  ·  Family: ${formData.familySize}`,
        ML, y,
      );
    }

    y += 8;

    // ── Stats row ─────────────────────────────────────────────
    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 4;

    const stats = [
      { label: "Sq Ft",     value: plan.squareFootage.toLocaleString() },
      { label: "Bedrooms",  value: String(plan.bedrooms) },
      { label: "Bathrooms", value: String(plan.bathrooms) },
      { label: "Stories",   value: String(plan.stories) },
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

      if (si < 3) {
        doc.setDrawColor(229, 231, 235);
        doc.line(sx + sw, y + 1, sx + sw, y + 21);
      }
    });

    y += 26;
    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    // ── Description ───────────────────────────────────────────
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
    y += descLines.length * 5.5 + 5;

    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    // ── Highlights ────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("KEY HIGHLIGHTS", ML, y);
    y += 6;

    plan.highlights.forEach((h) => {
      // Wrap text to content width minus bullet indent (7mm)
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

    // ── Features ──────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("FEATURES", ML, y);
    y += 6;

    const featColW = CW / 2 - 3;
    plan.features.forEach((feat, fi) => {
      const col = fi % 2;
      const row = Math.floor(fi / 2);
      const fx = ML + col * (CW / 2);
      const fy = y + row * 9;

      doc.setFillColor(243, 244, 246);
      doc.roundedRect(fx, fy - 4, featColW, 7, 1.5, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      const truncated = feat.length > 32 ? feat.slice(0, 30) + "…" : feat;
      doc.text(truncated, fx + featColW / 2, fy, { align: "center" });
    });

    y += Math.ceil(plan.features.length / 2) * 9 + 4;

    doc.setDrawColor(229, 231, 235);
    doc.line(ML, y, PW - ML, y);
    y += 7;

    // ── Room breakdown ────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("ROOM BREAKDOWN", ML, y);
    y += 6;

    const roomColW = CW / 2 - 3;
    plan.rooms.forEach((room, ri) => {
      const col = ri % 2;
      const row = Math.floor(ri / 2);
      const rx = ML + col * (CW / 2);
      const ry = y + row * 9;

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

    // ── Footer ────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 14, PW, 14, "F");
    doc.setDrawColor(229, 231, 235);
    doc.line(0, PH - 14, PW, PH - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    if (whiteLabel) {
      doc.text(companyLabel, ML, PH - 9);
      doc.text(`© ${new Date().getFullYear()} ${companyLabel}. All rights reserved.`, PW - ML, PH - 9, { align: "right" });
    } else {
      doc.text("Powered by SplanAI · Data: Google Maps + RentCast · splanai.com", ML, PH - 9);
      doc.text(`© ${new Date().getFullYear()} SplanAI. All rights reserved.`, PW - ML, PH - 9, { align: "right" });
    }
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180);
    doc.text("For informational purposes only. Data subject to change. Not a substitute for professional architectural or legal advice.", ML, PH - 4);
  });

  return doc;
}

type PdfLang = 'en' | 'es' | 'zh';
const PDF_LANG_CYCLE: PdfLang[] = ['en', 'es', 'zh'];
const PDF_LANG_META: Record<PdfLang, { flag: string; label: string }> = {
  en: { flag: '🇺🇸', label: 'EN' },
  es: { flag: '🇲🇽', label: 'ES' },
  zh: { flag: '🇨🇳', label: '中文' },
};

export default function Results() {
  const router = useRouter();
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [mlsData, setMlsData] = useState<{ attribution?: string; disclaimer?: string; mlsProvider?: string; dataTimestamp?: string } | null>(null);
  const [whiteLabelOptions, setWhiteLabelOptions] = useState<{ enabled: boolean; companyName: string }>({ enabled: false, companyName: "" });
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLang, setPdfLang] = useState<PdfLang>('en');
  const [neighborhood, setNeighborhood] = useState<NeighborhoodData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [neighborhoodLoading, setNeighborhoodLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("floorPlans");
    const storedForm = sessionStorage.getItem("formData");
    const storedLocation = sessionStorage.getItem("location");

    if (!stored) {
      router.push("/");
      return;
    }

    try {
      setPlans(JSON.parse(stored));
      if (storedForm) setFormData(JSON.parse(storedForm));
      const storedMls = sessionStorage.getItem("mlsData");
      if (storedMls) setMlsData(JSON.parse(storedMls));
      // Check white-label settings
      fetch("/api/team/plan")
        .then(r => r.json())
        .then((d: { plan: string; companyName: string }) => {
          if (d.plan === "team") {
            setWhiteLabelOptions({ enabled: true, companyName: d.companyName });
          }
        })
        .catch(() => {});

      if (storedLocation) {
        const loc = JSON.parse(storedLocation) as { city: string; state: string };
        setNeighborhoodLoading(true);
        fetch(`/api/neighborhood?city=${encodeURIComponent(loc.city)}&state=${encodeURIComponent(loc.state)}`)
          .then(r => r.json())
          .then((data: { neighborhood: NeighborhoodData; market: MarketData }) => {
            setNeighborhood(data.neighborhood);
            setMarket(data.market);
          })
          .catch(() => {})
          .finally(() => setNeighborhoodLoading(false));
      }
    } catch {
      router.push("/");
    }
  }, [router]);

  async function handleShare() {
    setShareLoading(true);
    try {
      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { url: string };
      setShareUrl(data.url);
    } catch {
      alert("Could not generate share link. Please try again.");
    } finally {
      setShareLoading(false);
    }
  }

  async function handleCopyUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

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

  async function handleExportAll() {
    setPdfLoading(true);
    try {
      if (pdfLang === "zh") {
        await downloadZH(plans, "SplanAI-Floor-Plans-ZH.pdf");
      } else {
        const doc = await buildPDF(plans, formData, whiteLabelOptions);
        const pdfName = whiteLabelOptions.enabled && whiteLabelOptions.companyName
          ? `${whiteLabelOptions.companyName.replace(/\s+/g, "-")}-Floor-Plans.pdf`
          : "SplanAI-Floor-Plans.pdf";
        doc.save(pdfName);
      }
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleExportOne(plan: FloorPlan) {
    const filename = `SplanAI-${plan.name.replace(/\s+/g, "-")}${pdfLang === "zh" ? "-ZH" : ""}.pdf`;
    if (pdfLang === "zh") {
      await downloadZH([plan], filename);
    } else {
      const doc = await buildPDF([plan], formData, whiteLabelOptions);
      doc.save(filename);
    }
  }

  if (plans.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-3 items-center">
          {/* Left — New Search */}
          <div className="flex items-center">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              New Search
            </button>
          </div>

          {/* Center — Logo (exactly centered) */}
          <div className="flex justify-center">
            <a href="https://splanai.com" className="text-xl font-bold tracking-tight text-gray-900 hover:opacity-80 transition-opacity">
              Splan<span className="text-blue-600">AI</span>
            </a>
          </div>

          {/* Right — Actions */}
          <div className="flex items-center justify-end gap-2">
            {/* Share with Client */}
            {!shareUrl ? (
              <button
                onClick={handleShare}
                disabled={shareLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-emerald-500 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-60"
              >
                {shareLoading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
                Share with Client
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-xs text-emerald-700 font-medium max-w-[180px] truncate">{shareUrl}</span>
                <button
                  onClick={handleCopyUrl}
                  className="shrink-0 text-emerald-600 hover:text-emerald-800 transition-colors"
                  title="Copy link"
                >
                  {shareCopied ? (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>
              </div>
            )}

            {/* PDF language cycle button */}
            <button
              onClick={() => setPdfLang(PDF_LANG_CYCLE[(PDF_LANG_CYCLE.indexOf(pdfLang) + 1) % PDF_LANG_CYCLE.length])}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              title="PDF language"
            >
              <span>{PDF_LANG_META[PDF_LANG_CYCLE[(PDF_LANG_CYCLE.indexOf(pdfLang) + 1) % PDF_LANG_CYCLE.length]].flag}</span>
              <span className="hidden sm:inline">{PDF_LANG_META[pdfLang].label} PDF</span>
            </button>
            <button
              onClick={handleExportAll}
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
              Export All (PDF)
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900">Your 3 Floor Plan Proposals</h1>
          {formData && (
            <p className="mt-2 text-gray-500">
              {Number(formData.lotSize).toLocaleString()} sq ft lot &nbsp;·&nbsp;
              ${Number(formData.budget).toLocaleString()} budget &nbsp;·&nbsp;
              {formData.familySize} {Number(formData.familySize) === 1 ? "person" : "people"}
            </p>
          )}
          {/* MLS badge + attribution */}
          {mlsData && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                🔗 MLS Connected
              </span>
              <p className="text-xs text-gray-400 max-w-lg">
                {mlsData.attribution ?? "MLS data provided in real-time via Trestle."}
                {mlsData.dataTimestamp && ` · Data updated: ${new Date(mlsData.dataTimestamp).toLocaleString()}`}
              </p>
              <p className="text-xs text-gray-300 max-w-lg">
                {mlsData.disclaimer ?? "For personal, non-commercial use only. Information deemed reliable but not guaranteed."}
              </p>
            </div>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan, i) => {
            const colors = STYLE_COLORS[i % STYLE_COLORS.length];
            const isSelected = selectedPlan === plan.id;

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(isSelected ? null : plan.id)}
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
                      <p className="text-2xl font-extrabold text-gray-900">
                        ${(plan.estimatedCost / 1000).toFixed(0)}K
                      </p>
                      <p className="text-xs text-gray-500">estimated cost</p>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { label: "Sq Ft", value: plan.squareFootage.toLocaleString() },
                    { label: "Beds", value: plan.bedrooms },
                    { label: "Baths", value: plan.bathrooms },
                    { label: "Stories", value: plan.stories },
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
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Features</h3>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {plan.features.map((f, j) => (
                        <span key={j} className="px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700 font-medium shadow-sm">
                          {f}
                        </span>
                      ))}
                    </div>

                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Room Breakdown</h3>
                    <div className="grid grid-cols-2 gap-1.5 mb-5">
                      {plan.rooms.map((room, j) => (
                        <div key={j} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 text-xs border border-gray-100">
                          <span className="text-gray-700 font-medium">{room.name}</span>
                          <span className="text-gray-500">{room.sqft} sqft</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportOne(plan); }}
                      className={`w-full py-3 rounded-xl text-white text-sm font-semibold ${colors.badge} hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mb-4`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download This Plan as PDF
                    </button>

                    {/* Mortgage calculator — stop propagation so card doesn't toggle */}
                    <div onClick={e => e.stopPropagation()}>
                      <MortgageCalculator homePrice={plan.estimatedCost} />
                    </div>
                  </div>
                )}

                {!isSelected && (
                  <div className="px-6 pb-5">
                    <p className="text-xs text-center text-gray-400">Click to expand details</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Neighborhood & Market Data */}
        {(neighborhoodLoading || neighborhood || market) && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">
              Neighborhood & Market Data
            </h2>
            {(neighborhood?.city || market?.city) && (() => {
              const city  = neighborhood?.city  || market?.city  || formData?.city  || "";
              const state = neighborhood?.state || market?.state || formData?.state || "";
              const zillowCity  = city.trim().replace(/\s+/g, "-");
              const zillowUrl   = `https://www.zillow.com/homes/for_sale/${encodeURIComponent(zillowCity)},-${state.trim()}_rb/`;
              return (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                  <p className="text-blue-600 font-medium">{city}, {state}</p>
                  <a
                    href={zillowUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View lots on Zillow →
                  </a>
                </div>
              );
            })()}

            {/* Approaching-limit warning banner */}
            {(neighborhood?.nearingLimit || market?.nearingLimit) && (
              <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                月間データ使用量が上限に近づいています。今月中にデータが取得できなくなる場合があります。
              </div>
            )}

            {neighborhoodLoading ? (
              <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Fetching neighborhood data…</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Safety Score */}
                {neighborhood?.available && neighborhood.safety && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <span className="text-lg">🛡️</span> Safety Score
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold text-white shrink-0 ${
                        neighborhood.safety.label === 'High'     ? 'bg-emerald-500' :
                        neighborhood.safety.label === 'Moderate' ? 'bg-yellow-500'  : 'bg-red-400'
                      }`}>
                        {neighborhood.safety.score}
                      </div>
                      <div>
                        <p className={`text-lg font-bold ${
                          neighborhood.safety.label === 'High'     ? 'text-emerald-600' :
                          neighborhood.safety.label === 'Moderate' ? 'text-yellow-600'  : 'text-red-500'
                        }`}>{neighborhood.safety.label}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {neighborhood.safety.policeStations} police · {neighborhood.safety.fireStations} fire station{neighborhood.safety.fireStations !== 1 ? 's' : ''} within 5 km
                        </p>
                        <p className="text-xs text-gray-300 mt-0.5">Based on public safety infrastructure</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Schools */}
                {neighborhood?.available && neighborhood.schools && neighborhood.schools.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <span className="text-lg">🏫</span> Nearby Schools
                    </h3>
                    <ul className="space-y-3">
                      {neighborhood.schools.map((s, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                              {s.distanceKm != null && <span className="font-medium text-blue-600">{s.distanceKm} km</span>}
                              {s.vicinity && <span className="truncate">{s.vicinity}</span>}
                            </p>
                          </div>
                          {s.rating != null && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-bold border border-yellow-100">
                              ★ {s.rating}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Hospitals */}
                {neighborhood?.available && neighborhood.hospitals && neighborhood.hospitals.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <span className="text-lg">🏥</span> Nearby Hospitals
                    </h3>
                    <ul className="space-y-3">
                      {neighborhood.hospitals.map((h, i) => (
                        <li key={i}>
                          <p className="text-sm font-medium text-gray-800">{h.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                            {h.distanceKm != null && <span className="font-medium text-blue-600">{h.distanceKm} km</span>}
                            {h.vicinity && <span>{h.vicinity}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Grocery */}
                {neighborhood?.available && neighborhood.groceries && neighborhood.groceries.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <span className="text-lg">🛒</span> Nearby Grocery Stores
                    </h3>
                    <ul className="space-y-3">
                      {neighborhood.groceries.map((g, i) => (
                        <li key={i}>
                          <p className="text-sm font-medium text-gray-800">{g.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                            {g.distanceKm != null && <span className="font-medium text-blue-600">{g.distanceKm} km</span>}
                            {g.vicinity && <span>{g.vicinity}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Market data */}
                {market?.available && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <span className="text-lg">📊</span> Local Market Data
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {market.averageRent != null && (
                        <div className="bg-blue-50 rounded-xl p-3">
                          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Avg Rent</p>
                          <p className="text-lg font-bold text-gray-900 mt-1 truncate">
                            ${market.averageRent.toLocaleString()}
                            <span className="text-xs font-normal text-gray-500">/mo</span>
                          </p>
                        </div>
                      )}
                      {market.medianRent != null && (
                        <div className="bg-emerald-50 rounded-xl p-3">
                          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Median Rent</p>
                          <p className="text-lg font-bold text-gray-900 mt-1 truncate">
                            ${market.medianRent.toLocaleString()}
                            <span className="text-xs font-normal text-gray-500">/mo</span>
                          </p>
                        </div>
                      )}
                      {market.averageSalePrice != null && (
                        <div className="bg-violet-50 rounded-xl p-3">
                          <p className="text-xs text-violet-600 font-semibold uppercase tracking-wider">Avg Sale Price</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">${(market.averageSalePrice / 1000).toFixed(0)}K</p>
                        </div>
                      )}
                      {market.medianSalePrice != null && (
                        <div className="bg-orange-50 rounded-xl p-3">
                          <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider">Median Sale Price</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">${(market.medianSalePrice / 1000).toFixed(0)}K</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">Source: RentCast · Updated monthly</p>
                  </div>
                )}

                {/* Unavailable notices — show exact spec messages */}
                {neighborhood && !neighborhood.available && (
                  <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 flex items-center gap-3 text-gray-500">
                    <span className="text-lg">📍</span>
                    <p className="text-sm">{neighborhood.reason}</p>
                  </div>
                )}
                {market && !market.available && (
                  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 opacity-70">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                      <span className="text-lg">📊</span> Local Market Data
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {["Avg Rent", "Median Rent", "Avg Sale Price", "Median Sale Price"].map(label => (
                        <div key={label} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
                          <p className="text-base font-bold text-gray-300 mt-1">—</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Market data temporarily unavailable. Check back soon.
                    </p>
                  </div>
                )}

                {/* Zoning — coming soon */}
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 opacity-60">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏛️</span> Zoning
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Coming soon</span>
                  </h3>
                  <p className="text-sm text-gray-400">Zoning: R-1 Single Family</p>
                  <p className="text-xs text-gray-300 mt-1">Powered by Zoneomics · Enter street address to unlock</p>
                </div>

                {/* Parcel Size — coming soon */}
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 opacity-60">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span className="text-lg">📐</span> Parcel Data
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Coming soon</span>
                  </h3>
                  <p className="text-sm text-gray-400">Official lot boundaries · setback rules · ownership</p>
                  <p className="text-xs text-gray-300 mt-1">Powered by Regrid · Enter street address to unlock</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-12 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-8 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:border-gray-400 hover:bg-white transition-all"
          >
            ← Generate New Plans
          </button>
        </div>
      </div>
    </div>
  );
}
