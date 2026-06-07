"use client";

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { PortalBranding } from "./page";
import { conceptImageSrc } from "@/lib/concept-style-image";

function calcMonthly(homePrice: number, downPct: number, ratePct: number, termYears: number): number {
  const principal = homePrice * (1 - downPct / 100);
  const r = ratePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

interface FinancialsSnapshot {
  rate: number;
  downPct: number;
  termYears: number;
  rateAsOf: string;
}

function MortgageWidget({
  homePrice,
  mortgageEst,
  mortgageDisclaimer,
  downPctLabel,
  interestRateLabel,
  initialFinancials,
}: {
  homePrice: number;
  mortgageEst: string;
  mortgageDisclaimer: string;
  downPctLabel: string;
  interestRateLabel: string;
  initialFinancials: FinancialsSnapshot | null;
}) {
  const [downPct, setDownPct] = useState(initialFinancials?.downPct ?? 20);
  const [ratePct, setRatePct] = useState(initialFinancials?.rate ?? 6.5);
  const monthly = calcMonthly(homePrice, downPct, ratePct, initialFinancials?.termYears ?? 30);
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-0.5">{mortgageEst}</p>
          <p className="text-xl font-extrabold text-blue-700">≈ ${monthly.toLocaleString()}<span className="text-sm font-normal text-blue-400">/mo</span></p>
          <p className="text-xs text-blue-400 mt-0.5">
            {downPct}% down · {initialFinancials?.termYears ?? 30}yr · {ratePct.toFixed(2)}%
            {initialFinancials?.rateAsOf && (
              <span className="text-blue-300"> · as of {new Date(initialFinancials.rateAsOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            )}
          </p>
        </div>
        <span className="text-2xl">🏦</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-blue-500 font-medium">{downPctLabel} %</label>
          <input
            type="range" min={0} max={50} step={5} value={downPct}
            onChange={e => setDownPct(Number(e.target.value))}
            className="w-full accent-blue-600 mt-1"
          />
          <p className="text-xs text-blue-600 font-bold text-center">{downPct}%</p>
        </div>
        <div>
          <label className="text-xs text-blue-500 font-medium">{interestRateLabel} %</label>
          <input
            type="range" min={3} max={12} step={0.25} value={ratePct}
            onChange={e => setRatePct(Number(e.target.value))}
            className="w-full accent-blue-600 mt-1"
          />
          <p className="text-xs text-blue-600 font-bold text-center">{ratePct.toFixed(2)}%</p>
        </div>
      </div>
      <p className="text-[10px] text-blue-400 italic mt-2">{mortgageDisclaimer}</p>
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
  // Phase 2: builder-provided image URL takes priority over style mapping
  imageUrl?: string | null;
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

// ── Configurator pricing model ──────────────────────────────────────────────
const STYLE_PREMIUM: Record<string, number> = {
  Contemporary: 12000, ModernFarmhouse: 8000,
  Transitional: 4000,  Craftsman: 4000,
  Colonial: 0,         Ranch: 0,
}
const MARGINAL_PER_SQFT = 200
const BATH_PER_BATH     = 15000
const BEDROOM_COST      = 10000
const STYLES = ['Contemporary', 'Modern Farmhouse', 'Transitional', 'Craftsman', 'Colonial', 'Ranch']

function getStylePremium(style: string): number {
  return STYLE_PREMIUM[style.replace(/\s+/g, '')] ?? 0
}

function displayStyle(style: string): string {
  return style.replace(/([a-z])([A-Z])/g, '$1 $2')
}

interface ConfigState { sqft: number; beds: number; baths: number; style: string }

function computeConfigPrice(plan: FloorPlan, cfg: ConfigState): number {
  const raw = plan.estimatedCost
    + (cfg.sqft  - plan.squareFootage) * MARGINAL_PER_SQFT
    + (cfg.baths - plan.bathrooms)     * BATH_PER_BATH
    + (cfg.beds  - plan.bedrooms)      * BEDROOM_COST
    + (getStylePremium(cfg.style) - getStylePremium(plan.style))
  return Math.max(150000, Math.round(raw / 500) * 500)
}

function buildBreakdown(plan: FloorPlan, cfg: ConfigState, baseStyle: string): string {
  const parts: string[] = ['Base']
  const sqftDelta = cfg.sqft - plan.squareFootage
  if (sqftDelta !== 0) parts.push(`${sqftDelta > 0 ? '+' : ''}${sqftDelta.toLocaleString()} sqft`)
  const bathDelta = cfg.baths - plan.bathrooms
  if (bathDelta !== 0) parts.push(`${bathDelta > 0 ? '+' : ''}${bathDelta} ba`)
  const bedDelta = cfg.beds - plan.bedrooms
  if (bedDelta !== 0) parts.push(`${bedDelta > 0 ? '+' : ''}${bedDelta} bd`)
  if (cfg.style !== baseStyle) parts.push(cfg.style)
  return parts.join(' · ')
}

// --- Squarified treemap layout ---
interface TileRoom { name: string; sqft: number; area: number; x: number; y: number; w: number; h: number; }

function squarifiedLayout(
  items: Array<{ name: string; sqft: number; area: number }>,
  x: number, y: number, w: number, h: number,
): TileRoom[] {
  if (items.length === 0 || w <= 0 || h <= 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];

  const s = Math.min(w, h);

  const worstAR = (row: typeof items): number => {
    const R = row.reduce((a, r) => a + r.area, 0);
    if (R <= 0) return Infinity;
    const stripLen = R / s;
    let worst = 0;
    for (const item of row) {
      if (item.area <= 0) continue;
      const perpLen = item.area / stripLen;
      const ar = stripLen > perpLen ? stripLen / perpLen : perpLen / stripLen;
      if (ar > worst) worst = ar;
    }
    return worst;
  };

  // Build the optimal row greedily
  let row: typeof items = [];
  let i = 0;
  while (i < items.length) {
    const candidate = [...row, items[i]];
    if (row.length === 0 || worstAR(candidate) <= worstAR(row)) {
      row = candidate;
      i++;
    } else {
      break;
    }
  }

  const rowArea = row.reduce((a, r) => a + r.area, 0);
  const stripLen = rowArea / s;
  const result: TileRoom[] = [];

  if (w >= h) {
    // Vertical strip on the left side
    let cy = y;
    for (const item of row) {
      const itemH = item.area / stripLen;
      result.push({ ...item, x, y: cy, w: stripLen, h: itemH });
      cy += itemH;
    }
    result.push(...squarifiedLayout(items.slice(i), x + stripLen, y, w - stripLen, h));
  } else {
    // Horizontal strip on the top
    let cx = x;
    for (const item of row) {
      const itemW = item.area / stripLen;
      result.push({ ...item, x: cx, y, w: itemW, h: stripLen });
      cx += itemW;
    }
    result.push(...squarifiedLayout(items.slice(i), x, y + stripLen, w, h - stripLen));
  }

  return result;
}

const FLOOR_UPPER_RE = /\b(upper|second|2nd|upstairs)\b/i;

function ConceptLayout({
  plan,
  colorRGB,
  conceptLayout,
  conceptCaption,
  mainFloor,
  upperFloor,
}: {
  plan: FloorPlan;
  colorRGB: [number, number, number];
  conceptLayout: string;
  conceptCaption: string;
  mainFloor: string;
  upperFloor: string;
}) {
  const SVG_W = 400;
  const SVG_H = 220;
  const LABEL_H = 18;
  const GAP = 1.5;
  const [r, g, b] = colorRGB;

  const hasUpper = plan.rooms.some(room => FLOOR_UPPER_RE.test(room.name));
  const twoFloors = plan.stories > 1 && hasUpper;

  const upperRooms = twoFloors ? plan.rooms.filter(room =>  FLOOR_UPPER_RE.test(room.name)) : [];
  const mainRooms  = twoFloors ? plan.rooms.filter(room => !FLOOR_UPPER_RE.test(room.name)) : plan.rooms;

  function buildLayout(rooms: Room[], lx: number, ly: number, lw: number, lh: number): TileRoom[] {
    if (rooms.length === 0) return [];
    const total = rooms.reduce((s, room) => s + room.sqft, 0);
    if (total <= 0) return [];
    const sorted = [...rooms].sort((a, b) => b.sqft - a.sqft).map(room => ({
      ...room,
      area: (room.sqft / total) * lw * lh,
    }));
    return squarifiedLayout(sorted, lx, ly, lw, lh);
  }

  const maxSqft = Math.max(...plan.rooms.map(room => room.sqft), 1);

  const panelW = twoFloors ? (SVG_W - 4) / 2 : SVG_W;
  const layoutY  = twoFloors ? LABEL_H : 0;
  const layoutH  = SVG_H - layoutY;

  const mainLayout  = buildLayout(mainRooms,  0,           layoutY, panelW, layoutH);
  const upperLayout = twoFloors ? buildLayout(upperRooms, panelW + 4, layoutY, panelW, layoutH) : [];

  const allTiles = [...mainLayout, ...upperLayout];

  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{conceptLayout}</h3>
      <div className="rounded-xl overflow-hidden border border-gray-100">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full block"
          aria-label={conceptCaption}
          style={{ background: "#f9fafb" }}
        >
          {twoFloors && (
            <>
              <text x={panelW / 2} y={LABEL_H - 4} fontSize={9} fontWeight="700" textAnchor="middle"
                fill={`rgb(${r},${g},${b})`} style={{ letterSpacing: "0.1em" }}>
                {mainFloor.toUpperCase()}
              </text>
              <text x={panelW + 4 + panelW / 2} y={LABEL_H - 4} fontSize={9} fontWeight="700" textAnchor="middle"
                fill={`rgb(${r},${g},${b})`} style={{ letterSpacing: "0.1em" }}>
                {upperFloor.toUpperCase()}
              </text>
              <line x1={panelW + 2} y1={0} x2={panelW + 2} y2={SVG_H} stroke="white" strokeWidth={4} />
            </>
          )}
          {allTiles.map((tile, ti) => {
            const px = tile.x + GAP;
            const py = tile.y + GAP;
            const pw = Math.max(0, tile.w - GAP * 2);
            const ph = Math.max(0, tile.h - GAP * 2);
            const alpha = 0.18 + 0.40 * (tile.sqft / maxSqft);
            const fillR = Math.round(r * alpha + 240 * (1 - alpha));
            const fillG = Math.round(g * alpha + 248 * (1 - alpha));
            const fillB = Math.round(b * alpha + 250 * (1 - alpha));

            const showName = pw > 30 && ph > 15;
            const showSqft = pw > 44 && ph > 28;
            const maxChars = Math.max(4, Math.floor(pw / 6.2));
            const cleanName = tile.name.replace(/\s*\(.*?\)/g, "").trim();
            const displayName = cleanName.length > maxChars ? cleanName.slice(0, maxChars - 1) + "…" : cleanName;

            return (
              <g key={ti}>
                <rect x={px} y={py} width={pw} height={ph} rx={3} ry={3}
                  fill={`rgb(${fillR},${fillG},${fillB})`} />
                {showName && (
                  <text
                    x={px + pw / 2} y={py + ph / 2 - (showSqft ? 5 : 0)}
                    fontSize={8} fontWeight="600" textAnchor="middle" dominantBaseline="middle"
                    fill={`rgb(${Math.round(r * 0.5)},${Math.round(g * 0.5)},${Math.round(b * 0.5)})`}
                  >
                    {displayName}
                  </text>
                )}
                {showSqft && (
                  <text
                    x={px + pw / 2} y={py + ph / 2 + 8}
                    fontSize={7} textAnchor="middle" dominantBaseline="middle"
                    fill={`rgba(${r},${g},${b},0.65)`}
                  >
                    {tile.sqft} sqft
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[10px] text-gray-400 italic mt-1.5 leading-snug">{conceptCaption}</p>
    </div>
  );
}

function ConceptImage({ style, imageUrl }: { style: string; imageUrl?: string | null }) {
  const [src, setSrc] = useState(() => conceptImageSrc(style, imageUrl));
  const [hidden, setHidden] = useState(false);

  const handleError = () => {
    if (src !== "/concept-styles/default.jpg") {
      setSrc("/concept-styles/default.jpg");
    } else {
      setHidden(true);
    }
  };

  if (hidden) return null;

  return (
    <div className="relative w-full aspect-video overflow-hidden bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${style} home exterior`}
        className="w-full h-full object-cover"
        onError={handleError}
      />
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-white text-[10px] leading-tight">
          Representative image — your custom home will be designed for your lot.
        </p>
      </div>
    </div>
  );
}

function PlanConfigurator({ plan, financials }: { plan: FloorPlan; financials: FinancialsSnapshot | null }) {
  const baseStyle = displayStyle(plan.style)
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<ConfigState>({
    sqft: plan.squareFootage, beds: plan.bedrooms, baths: plan.bathrooms, style: baseStyle,
  })

  const price    = computeConfigPrice(plan, cfg)
  const rate     = financials?.rate ?? 6.5
  const downPct  = financials?.downPct ?? 20
  const termYears = financials?.termYears ?? 30
  const rateAsOf  = financials?.rateAsOf ?? null
  const monthly   = calcMonthly(price, downPct, rate, termYears)
  const breakdown = buildBreakdown(plan, cfg, baseStyle)
  const isModified = cfg.sqft !== plan.squareFootage || cfg.beds !== plan.bedrooms || cfg.baths !== plan.bathrooms || cfg.style !== baseStyle
  const isTight    = cfg.sqft / cfg.beds < 300
  const sqftMin    = Math.max(1200, plan.squareFootage - 800)
  const sqftMax    = Math.min(5000, plan.squareFootage + 1000)
  const styleOpts  = STYLES.includes(baseStyle) ? STYLES : [baseStyle, ...STYLES]

  return (
    <div className="border-t border-gray-100" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-3 flex items-center justify-between text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Customize this plan
        </span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-5 pt-1 space-y-4 bg-gray-50/60">
          {/* Price + monthly */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
            <p className="text-3xl font-extrabold text-gray-900">${price.toLocaleString()}</p>
            <p className="text-lg font-bold text-blue-600 mt-1">
              ≈ ${monthly.toLocaleString()}<span className="text-sm font-normal text-gray-400">/mo</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Est. P&amp;I · {rate.toFixed(2)}%
              {rateAsOf ? ` (as of ${new Date(rateAsOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}
              {' '}· {downPct}% down · {termYears}-yr
            </p>
          </div>

          {/* Size */}
          <div>
            <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
              <span>Size</span>
              <span className="font-bold text-gray-900">{cfg.sqft.toLocaleString()} sqft</span>
            </div>
            <input type="range" min={sqftMin} max={sqftMax} step={50} value={cfg.sqft}
              onChange={e => setCfg(c => ({ ...c, sqft: Number(e.target.value) }))}
              className="w-full accent-indigo-600" />
            {isTight && <p className="text-xs text-amber-500 mt-1">Tight for {cfg.beds} bedrooms</p>}
          </div>

          {/* Bedrooms */}
          <div>
            <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
              <span>Bedrooms</span>
              <span className="font-bold text-gray-900">{cfg.beds}</span>
            </div>
            <input type="range" min={2} max={6} step={1} value={cfg.beds}
              onChange={e => setCfg(c => ({ ...c, beds: Number(e.target.value) }))}
              className="w-full accent-indigo-600" />
          </div>

          {/* Bathrooms */}
          <div>
            <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
              <span>Bathrooms</span>
              <span className="font-bold text-gray-900">{cfg.baths}</span>
            </div>
            <input type="range" min={1} max={5} step={0.5} value={cfg.baths}
              onChange={e => setCfg(c => ({ ...c, baths: Number(e.target.value) }))}
              className="w-full accent-indigo-600" />
          </div>

          {/* Style */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Style</label>
            <select
              value={cfg.style}
              onChange={e => setCfg(c => ({ ...c, style: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {styleOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl bg-blue-50 px-4 py-3">
            <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-0.5">How this is calculated</p>
            <p className="text-xs text-blue-700 font-medium">{breakdown}</p>
          </div>

          {/* Reset */}
          {isModified && (
            <button
              onClick={e => { e.stopPropagation(); setCfg({ sqft: plan.squareFootage, beds: plan.bedrooms, baths: plan.bathrooms, style: baseStyle }) }}
              className="w-full py-2 rounded-xl text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-white transition-colors"
            >
              Reset to original
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const T = {
  en: {
    title: "Your Custom Home Proposals",
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
    interested: "I'm interested in this one",
    inquiryTitle: "Express Interest",
    inquirySubtitle: "The builder will be notified and reach out to you.",
    yourName: "Your Name",
    yourEmail: "Email",
    yourPhone: "Phone",
    yourMessage: "Message (optional)",
    contactRequired: "Please enter your email or phone number.",
    emailInvalid: "Please enter a valid email address.",
    submit: "Send Inquiry",
    submitting: "Sending…",
    successTitle: "The builder has been notified!",
    successBody: "They'll be in touch soon.",
    cancel: "Cancel",
    conceptLayout: "Concept Layout",
    conceptCaption: "Concept layout — relative room sizes, not to scale. Not a construction drawing.",
    mainFloor: "Main Floor",
    upperFloor: "Upper Floor",
    costRange: "Est. range — finishes-dependent.",
    mortgageEst: "Monthly Est.",
    mortgageDisclaimer: "Illustrative estimate — not a financing offer.",
    downPct: "Down",
    interestRate: "Rate",
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
    interested: "Me interesa este",
    inquiryTitle: "Expresar interés",
    inquirySubtitle: "El constructor será notificado y se pondrá en contacto.",
    yourName: "Su nombre",
    yourEmail: "Correo electrónico",
    yourPhone: "Teléfono",
    yourMessage: "Mensaje (opcional)",
    contactRequired: "Por favor ingrese su correo o teléfono.",
    emailInvalid: "Por favor ingrese un correo válido.",
    submit: "Enviar consulta",
    submitting: "Enviando…",
    successTitle: "¡El constructor ha sido notificado!",
    successBody: "Se pondrán en contacto pronto.",
    cancel: "Cancelar",
    conceptLayout: "Vista Conceptual",
    conceptCaption: "Vista conceptual — tamaños relativos de habitaciones, sin escala. No es un plano de construcción.",
    mainFloor: "Planta Baja",
    upperFloor: "Planta Alta",
    costRange: "Rango est. — depende de los acabados.",
    mortgageEst: "Mensualidad Est.",
    mortgageDisclaimer: "Estimación ilustrativa — no es una oferta de financiamiento.",
    downPct: "Entrada",
    interestRate: "Tasa",
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
    interested: "我对这个方案感兴趣",
    inquiryTitle: "表达兴趣",
    inquirySubtitle: "建造商将收到通知并与您联系。",
    yourName: "您的姓名",
    yourEmail: "电子邮件",
    yourPhone: "电话",
    yourMessage: "留言（可选）",
    contactRequired: "请输入您的邮箱或电话。",
    emailInvalid: "请输入有效的电子邮件地址。",
    submit: "发送询问",
    submitting: "发送中…",
    successTitle: "建造商已收到通知！",
    successBody: "他们会尽快与您联系。",
    cancel: "取消",
    conceptLayout: "概念布局图",
    conceptCaption: "概念布局图 — 相对房间大小，非按比例绘制，不作为施工图纸使用。",
    mainFloor: "主层",
    upperFloor: "上层",
    costRange: "估算区间 — 取决于装修标准。",
    mortgageEst: "月供估算",
    mortgageDisclaimer: "仅供参考，不构成融资报价。",
    downPct: "首付",
    interestRate: "利率",
  },
} as const;

type Lang = keyof typeof T;

const LANG_CYCLE: Lang[] = ["en", "es", "zh"];
const LANG_META: Record<Lang, { flag: string; label: string }> = {
  en: { flag: "🇺🇸", label: "EN" },
  es: { flag: "🇲🇽", label: "ES" },
  zh: { flag: "🇨🇳", label: "中文" },
};

async function buildPDF(plans: FloorPlan[], lang: Lang, branding: PortalBranding, financials?: FinancialsSnapshot | null): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297, ML = 20, CW = PW - ML * 2;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const isTeam = branding.plan === "team";
  const isPro  = branding.plan === "pro";
  const companyLabel = branding.companyName?.trim() || "";
  const logoBase64 = branding.logoDataUrl ?? null;

  plans.forEach((plan, pi) => {
    if (pi > 0) doc.addPage();
    const [cr, cg, cb] = PLAN_COLORS[pi % PLAN_COLORS.length];

    const HEADER_H = 28;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PW, HEADER_H, "F");
    doc.setDrawColor(220, 220, 220);
    doc.line(0, HEADER_H, PW, HEADER_H);

    if ((isTeam || isPro) && logoBase64) {
      doc.addImage(logoBase64, "PNG", ML, 2, 80, 24);
    } else if (isTeam && companyLabel) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text(companyLabel, ML, HEADER_H / 2 + 2);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text("Splan", ML, HEADER_H / 2 + 2);
      const splanW = doc.getTextWidth("Splan");
      doc.setTextColor(59, 130, 246);
      doc.text("AI", ML + splanW, HEADER_H / 2 + 2);
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
    const costHigh = Math.round(plan.estimatedCost * 1.1);
    doc.text(`$${plan.estimatedCost.toLocaleString()}–$${costHigh.toLocaleString()}`, PW - ML, y, { align: "right" });
    {
      const mDown = financials?.downPct ?? 20;
      const mRate = financials?.rate ?? 6.5;
      const mTerm = financials?.termYears ?? 30;
      const pdfMonthly = calcMonthly(plan.estimatedCost, mDown, mRate, mTerm);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text(`≈ $${pdfMonthly.toLocaleString()}/mo · ${mDown}% dn · ${mTerm}yr · ${mRate.toFixed(1)}% — illustrative only`, PW - ML, y + 4.5, { align: "right" });
    }

    y += 13;
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

    // Concept layout: proportional bars after rooms section
    const roomsBottomY = y + Math.ceil(plan.rooms.length / 2) * 9;
    const barTopY      = roomsBottomY + 8;
    const barH         = 22;
    if (barTopY + barH + 10 < PH - 16) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(T[lang].conceptLayout.toUpperCase(), ML, barTopY - 2);

      const sortedRooms = [...plan.rooms].sort((a, b) => b.sqft - a.sqft);
      const totalSqftPDF = sortedRooms.reduce((s, r) => s + r.sqft, 0);
      const maxSqftPDF   = sortedRooms[0]?.sqft ?? 1;
      let bx = ML;
      for (const room of sortedRooms) {
        const blockW = (room.sqft / totalSqftPDF) * CW;
        const alpha  = 0.18 + 0.40 * (room.sqft / maxSqftPDF);
        doc.setFillColor(
          Math.round(cr * alpha + 240 * (1 - alpha)),
          Math.round(cg * alpha + 248 * (1 - alpha)),
          Math.round(cb * alpha + 250 * (1 - alpha)),
        );
        doc.roundedRect(bx, barTopY + 4, blockW - 0.5, barH, 1.5, 1.5, "F");
        if (blockW > 16) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6);
          doc.setTextColor(Math.round(cr * 0.5), Math.round(cg * 0.5), Math.round(cb * 0.5));
          const label = (doc.splitTextToSize(room.name, blockW - 4) as string[])[0];
          doc.text(label, bx + blockW / 2 - 0.25, barTopY + 4 + barH / 2 - (blockW > 24 ? 2.5 : 0), { align: "center" });
          if (blockW > 24) {
            doc.setFontSize(5.5);
            doc.text(`${room.sqft}sf`, bx + blockW / 2 - 0.25, barTopY + 4 + barH / 2 + 3.5, { align: "center" });
          }
        }
        bx += blockW;
      }
      doc.setFont("helvetica", "italic");
      doc.setFontSize(5.5);
      doc.setTextColor(180, 180, 180);
      doc.text(T[lang].conceptCaption, ML, barTopY + 4 + barH + 3);
    }

    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 14, PW, 14, "F");
    doc.setDrawColor(229, 231, 235);
    doc.line(0, PH - 14, PW, PH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const contactParts: string[] = [];
    if (branding.phone) contactParts.push(branding.phone);
    if (branding.website) contactParts.push(branding.website.replace(/^https?:\/\//, ""));
    const contactStr = contactParts.join(" · ");
    if (isTeam && companyLabel) {
      const leftLabel = contactStr ? `${companyLabel} · ${contactStr}` : companyLabel;
      doc.text(leftLabel, ML, PH - 9);
      doc.text(`© ${new Date().getFullYear()} ${companyLabel}`, PW - ML, PH - 9, { align: "right" });
    } else if (isPro && companyLabel) {
      const leftLabel = contactStr ? `${companyLabel} · ${contactStr}` : `${companyLabel} · Powered by SplanAI · splanai.com`;
      doc.text(leftLabel, ML, PH - 9);
      doc.text(`© ${new Date().getFullYear()} SplanAI`, PW - ML, PH - 9, { align: "right" });
    } else {
      doc.text("Powered by SplanAI · Data: Google Maps + RentCast · splanai.com", ML, PH - 9);
      doc.text(`© ${new Date().getFullYear()} SplanAI`, PW - ML, PH - 9, { align: "right" });
    }
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180);
    doc.text("Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them.", ML, PH - 4);
  });

  return doc;
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

interface Props {
  slug: string;
  plans: FloorPlan[];
  clientName: string | null;
  expiresAt: string | null;
  branding: PortalBranding;
  financials: FinancialsSnapshot | null;
  neighborhood: NeighborhoodData | null;
  market: MarketData | null;
  areaAsOf: string | null;
}

interface InquiryForm {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  message: string;
}

export default function SharePortalClient({ slug, plans, clientName, expiresAt, branding, financials, neighborhood, market, areaAsOf }: Props) {
  const isTeam = branding.plan === "team";
  const isPro  = branding.plan === "pro";
  const isBranded = isTeam || isPro;
  const companyLabel = branding.companyName?.trim() || "";
  const [lang, setLang] = useState<Lang>("en");
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Inquiry modal state
  const [inquiryPlanIndex, setInquiryPlanIndex] = useState<number | null>(null); // null = closed
  const [inquiryForm, setInquiryForm] = useState<InquiryForm>({ buyerName: "", buyerEmail: "", buyerPhone: "", message: "" });
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);

  const t = T[lang];

  function openInquiry(planIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    setInquiryPlanIndex(planIndex);
    setInquiryForm({ buyerName: "", buyerEmail: "", buyerPhone: "", message: "" });
    setInquiryError(null);
    setInquirySuccess(false);
  }

  function closeInquiry() {
    setInquiryPlanIndex(null);
    setInquirySuccess(false);
  }

  async function handleInquirySubmit(e: React.FormEvent) {
    e.preventDefault();
    setInquiryError(null);

    const email = inquiryForm.buyerEmail.trim();
    const phone = inquiryForm.buyerPhone.trim();
    if (!email && !phone) {
      setInquiryError(t.contactRequired);
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInquiryError(t.emailInvalid);
      return;
    }

    setInquirySubmitting(true);
    try {
      const res = await fetch(`/api/portal/${slug}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName:  inquiryForm.buyerName.trim() || null,
          buyerEmail: email || null,
          buyerPhone: phone || null,
          planIndex:  inquiryPlanIndex,
          message:    inquiryForm.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInquiryError(data.reason === "rate_limited" ? "Too many requests. Please try again later." : "Something went wrong. Please try again.");
        return;
      }
      setInquirySuccess(true);
    } finally {
      setInquirySubmitting(false);
    }
  }

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
        const doc = await buildPDF(plans, lang, branding, financials);
        const pdfName = isTeam && companyLabel
          ? `${companyLabel.replace(/\s+/g, "-")}-Floor-Plans.pdf`
          : "SplanAI-Floor-Plans.pdf";
        doc.save(pdfName);
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
    const prefix = isTeam && companyLabel ? companyLabel.replace(/\s+/g, "-") : "SplanAI";
    const filename = `${prefix}-${plan.name.replace(/\s+/g, "-")}${lang === "zh" ? "-ZH" : ""}.pdf`;
    if (lang === "zh") {
      await downloadZH([plan], filename);
    } else {
      const doc = await buildPDF([plan], lang, branding, financials);
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
      {/* Inquiry modal */}
      {inquiryPlanIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4"
          onClick={closeInquiry}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {inquirySuccess ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{t.successTitle}</h2>
                <p className="text-gray-500 text-sm">{t.successBody}</p>
                <button onClick={closeInquiry} className="mt-6 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-gray-900">{t.inquiryTitle}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t.inquirySubtitle}</p>
                  {inquiryPlanIndex !== null && (
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold text-white bg-blue-600">
                      Plan {inquiryPlanIndex + 1}
                    </span>
                  )}
                </div>
                <form onSubmit={handleInquirySubmit} className="space-y-3">
                  <input
                    type="text"
                    placeholder={t.yourName}
                    value={inquiryForm.buyerName}
                    onChange={(e) => setInquiryForm((f) => ({ ...f, buyerName: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    placeholder={t.yourEmail}
                    value={inquiryForm.buyerEmail}
                    onChange={(e) => setInquiryForm((f) => ({ ...f, buyerEmail: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="tel"
                    placeholder={t.yourPhone}
                    value={inquiryForm.buyerPhone}
                    onChange={(e) => setInquiryForm((f) => ({ ...f, buyerPhone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    placeholder={t.yourMessage}
                    rows={3}
                    value={inquiryForm.message}
                    onChange={(e) => setInquiryForm((f) => ({ ...f, message: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  {inquiryError && (
                    <p className="text-sm text-red-500">{inquiryError}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeInquiry}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={inquirySubmitting}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                      {inquirySubmitting ? t.submitting : t.submit}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {isBranded && branding.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoDataUrl} alt={companyLabel || "Builder"} className="h-7 object-contain max-w-[160px]" />
          ) : isBranded && companyLabel ? (
            <span className="text-xl font-bold tracking-tight text-gray-900">{companyLabel}</span>
          ) : (
            <a href="https://splanai.com" className="text-xl font-bold tracking-tight text-gray-900 hover:opacity-80 transition-opacity">
              Splan<span className="text-blue-600">AI</span>
            </a>
          )}

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

        {/* ── Area & Finance data (above plan cards) ────────────── */}
        {(neighborhood || market || financials) && (
          <div className="mb-10 space-y-6">
            {/* Location header */}
            {(neighborhood?.city || market?.city) && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">📍</span>
                <p className="text-blue-600 font-semibold">
                  {neighborhood?.city || market?.city}, {neighborhood?.state || market?.state}
                </p>
                {areaAsOf && (
                  <span className="text-xs text-gray-400">
                    · data as of {new Date(areaAsOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Safety score */}
              {neighborhood?.available && neighborhood.safety && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span>🛡️</span> Safety Score
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-extrabold text-white shrink-0 ${
                      neighborhood.safety.label === 'High' ? 'bg-emerald-500' :
                      neighborhood.safety.label === 'Moderate' ? 'bg-yellow-500' : 'bg-red-400'
                    }`}>
                      {neighborhood.safety.score}
                    </div>
                    <div>
                      <p className={`text-base font-bold ${
                        neighborhood.safety.label === 'High' ? 'text-emerald-600' :
                        neighborhood.safety.label === 'Moderate' ? 'text-yellow-600' : 'text-red-500'
                      }`}>{neighborhood.safety.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {neighborhood.safety.policeStations} police · {neighborhood.safety.fireStations} fire station{neighborhood.safety.fireStations !== 1 ? 's' : ''} within 5 km
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Market data */}
              {market?.available && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span>📊</span> Local Market
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {market.averageRent != null && (
                      <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Avg Rent</p>
                        <p className="text-base font-bold text-gray-900 mt-1">${market.averageRent.toLocaleString()}<span className="text-xs font-normal text-gray-500">/mo</span></p>
                      </div>
                    )}
                    {market.medianRent != null && (
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Median Rent</p>
                        <p className="text-base font-bold text-gray-900 mt-1">${market.medianRent.toLocaleString()}<span className="text-xs font-normal text-gray-500">/mo</span></p>
                      </div>
                    )}
                    {market.averageSalePrice != null && (
                      <div className="bg-violet-50 rounded-xl p-3">
                        <p className="text-xs text-violet-600 font-semibold uppercase tracking-wider">Avg Sale</p>
                        <p className="text-base font-bold text-gray-900 mt-1">${(market.averageSalePrice / 1000).toFixed(0)}K</p>
                      </div>
                    )}
                    {market.medianSalePrice != null && (
                      <div className="bg-orange-50 rounded-xl p-3">
                        <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider">Median Sale</p>
                        <p className="text-base font-bold text-gray-900 mt-1">${(market.medianSalePrice / 1000).toFixed(0)}K</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Schools */}
              {neighborhood?.available && neighborhood.schools && neighborhood.schools.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span>🏫</span> Nearby Schools
                  </h3>
                  <ul className="space-y-2">
                    {neighborhood.schools.map((s, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1.5">
                            {s.distanceKm != null && <span className="font-medium text-blue-600">{s.distanceKm} km</span>}
                            {s.vicinity && <span className="truncate">{s.vicinity}</span>}
                          </p>
                        </div>
                        {s.rating != null && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-bold border border-yellow-100">★ {s.rating}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Hospitals */}
              {neighborhood?.available && neighborhood.hospitals && neighborhood.hospitals.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span>🏥</span> Nearby Hospitals
                  </h3>
                  <ul className="space-y-2">
                    {neighborhood.hospitals.map((h, idx) => (
                      <li key={idx}>
                        <p className="text-sm font-medium text-gray-800">{h.name}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
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
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                    <span>🛒</span> Nearby Grocery
                  </h3>
                  <ul className="space-y-2">
                    {neighborhood.groceries.map((g, idx) => (
                      <li key={idx}>
                        <p className="text-sm font-medium text-gray-800">{g.name}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          {g.distanceKm != null && <span className="font-medium text-blue-600">{g.distanceKm} km</span>}
                          {g.vicinity && <span>{g.vicinity}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Unavailable notices */}
              {neighborhood && !neighborhood.available && (
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 flex items-center gap-3 text-gray-400">
                  <span>📍</span>
                  <p className="text-sm">Neighborhood data unavailable</p>
                </div>
              )}
            </div>

            {/* Finance snapshot banner */}
            {financials && (
              <div className="bg-blue-50 rounded-2xl border border-blue-100 px-5 py-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-lg">🏦</span>
                <span className="font-semibold text-blue-800">Financing snapshot at time of sharing:</span>
                <span className="text-blue-700">
                  {financials.downPct}% down · {financials.termYears}yr · {financials.rate.toFixed(1)}% rate
                </span>
                {financials.rateAsOf && (
                  <span className="text-blue-400 text-xs">
                    (30yr avg as of {new Date(financials.rateAsOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                  </span>
                )}
              </div>
            )}
          </div>
        )}

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
                {/* Exterior concept image */}
                <ConceptImage style={plan.style} imageUrl={plan.imageUrl} />

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
                        ${(plan.estimatedCost / 1000).toFixed(0)}–${Math.round(plan.estimatedCost * 1.1 / 1000)}K
                      </p>
                      <p className="text-xs text-gray-500">{t.costRange}</p>
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

                {/* Configurator — always visible, self-contained expander */}
                <PlanConfigurator plan={plan} financials={financials} />

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

                    <ConceptLayout
                      plan={plan}
                      colorRGB={PLAN_COLORS[(plan.id - 1) % PLAN_COLORS.length]}
                      conceptLayout={t.conceptLayout}
                      conceptCaption={t.conceptCaption}
                      mainFloor={t.mainFloor}
                      upperFloor={t.upperFloor}
                    />

                    <MortgageWidget
                      homePrice={plan.estimatedCost}
                      mortgageEst={t.mortgageEst}
                      mortgageDisclaimer={t.mortgageDisclaimer}
                      downPctLabel={t.downPct}
                      interestRateLabel={t.interestRate}
                      initialFinancials={financials}
                    />

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadOne(plan); }}
                      className={`w-full mt-4 py-3 rounded-xl text-white text-sm font-semibold ${colors.badge} hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {t.download}
                    </button>
                    <button
                      onClick={(e) => openInquiry(plan.id - 1, e)}
                      className="w-full mt-2 py-3 rounded-xl border-2 border-current text-sm font-semibold hover:bg-white/60 transition-colors flex items-center justify-center gap-2"
                      style={{ color: `rgb(${PLAN_COLORS[(plan.id - 1) % PLAN_COLORS.length].join(",")})` }}
                    >
                      {t.interested}
                    </button>
                  </div>
                )}

                {!isSelected && (
                  <div className="px-6 pb-5 space-y-2">
                    <button
                      onClick={(e) => openInquiry(plan.id - 1, e)}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white ${colors.badge} hover:opacity-90 transition-opacity`}
                    >
                      {t.interested}
                    </button>
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

          {isBranded && (companyLabel || branding.phone || branding.website || branding.tagline) ? (
            <div className="mb-4 space-y-1">
              {companyLabel && <p className="text-sm font-bold text-gray-800">{companyLabel}</p>}
              {branding.tagline && <p className="text-xs text-gray-500 italic">{branding.tagline}</p>}
              {(branding.phone || branding.website) && (
                <p className="text-xs text-gray-500 flex items-center justify-center gap-3 flex-wrap">
                  {branding.phone && (
                    <a href={`tel:${branding.phone}`} className="hover:text-blue-600 transition-colors">{branding.phone}</a>
                  )}
                  {branding.website && (
                    <a href={branding.website.startsWith("http") ? branding.website : `https://${branding.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">{branding.website.replace(/^https?:\/\//, "")}</a>
                  )}
                </p>
              )}
              {branding.licenseNumber && (
                <p className="text-xs text-gray-400">License #{branding.licenseNumber}</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-4">{t.contact}</p>
              <a href="https://splanai.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 transition-colors">
                <span className="text-base font-extrabold tracking-tight">Splan<span className="text-blue-500">AI</span></span>
              </a>
              <p className="text-xs text-gray-300 mt-1">{t.poweredBy} SplanAI · splanai.com</p>
            </>
          )}

          {isBranded && !isTeam && (
            <p className="text-xs text-gray-300 mt-3">{t.poweredBy} SplanAI</p>
          )}

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-300">
            <a href="https://splanai.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">Terms</a>
            <a href="https://splanai.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
