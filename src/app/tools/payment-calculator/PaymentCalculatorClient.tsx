"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { calcMonthly } from "@/lib/price-calculator";

// Rough national ballparks for the optional taxes-&-insurance line.
// Clearly labeled as estimates in the UI — property tax and insurance
// vary a lot by county and insurer.
const PROPERTY_TAX_PCT_PER_YEAR = 1.1;
const INSURANCE_USD_PER_YEAR = 1_800;

type PriceMode = "total" | "lot-build";

interface RateMeta {
  asOf: string;
  source: "fred" | "fallback";
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function PaymentCalculatorClient() {
  const [mode, setMode] = useState<PriceMode>("total");
  const [homePrice, setHomePrice] = useState("350000");
  const [lotBudget, setLotBudget] = useState("");
  const [buildBudget, setBuildBudget] = useState("");
  const [downPct, setDownPct] = useState(20);
  const [termYears, setTermYears] = useState(30);
  const [ratePct, setRatePct] = useState(6.5);
  const [rateMeta, setRateMeta] = useState<RateMeta | null>(null);
  const rateEdited = useRef(false);

  useEffect(() => {
    track("tools_view", { tool: "payment_calculator" });
    let cancelled = false;
    // Only network call on this page: the 24h-cached FRED average, used as a
    // starting point. The user's own number always wins (rateEdited guard).
    fetch("/api/mortgage-rate")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: { rate: number; asOf: string; source: "fred" | "fallback" }) => {
        if (cancelled || rateEdited.current) return;
        if (typeof d.rate === "number" && Number.isFinite(d.rate) && d.rate > 0) {
          setRatePct(d.rate);
          setRateMeta({ asOf: d.asOf, source: d.source });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const price = mode === "total" ? toNum(homePrice) : toNum(lotBudget) + toNum(buildBudget);
  const hasPrice = price > 0;

  const downAmount = price * (downPct / 100);
  const loanAmount = price - downAmount;
  const monthlyPI = hasPrice ? calcMonthly(price, downPct, ratePct, termYears) : 0;
  const totalInterest = hasPrice ? monthlyPI * termYears * 12 - loanAmount : 0;
  const taxInsMonthly = hasPrice
    ? (price * (PROPERTY_TAX_PCT_PER_YEAR / 100)) / 12 + INSURANCE_USD_PER_YEAR / 12
    : 0;

  const inputCls =
    "w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400";

  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
        Lot → Monthly Payment
      </h1>
      <p className="text-slate-400 leading-relaxed mb-8 max-w-xl">
        &ldquo;What would that run me a month?&rdquo; is usually the first real question a buyer
        asks. Type a price — or a lot plus a build budget — and get the principal &amp; interest
        number, with today&rsquo;s average 30-yr rate already filled in.
      </p>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 space-y-5">
          <div>
            <span className="block text-sm font-semibold text-slate-300 mb-2">Price</span>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(
                [
                  { id: "total", label: "Home price" },
                  { id: "lot-build", label: "Lot + build" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    mode === m.id
                      ? "bg-blue-500 text-white border-blue-500"
                      : "border-slate-600 text-slate-400 hover:border-blue-400"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "total" ? (
              <div>
                <label htmlFor="homePrice" className="block text-xs text-slate-500 mb-1.5">
                  Total home price (USD)
                </label>
                <input
                  id="homePrice"
                  type="number"
                  min={0}
                  placeholder="e.g. 350000"
                  value={homePrice}
                  onChange={(e) => setHomePrice(e.target.value)}
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lotBudget" className="block text-xs text-slate-500 mb-1.5">
                    Lot (USD)
                  </label>
                  <input
                    id="lotBudget"
                    type="number"
                    min={0}
                    placeholder="e.g. 90000"
                    value={lotBudget}
                    onChange={(e) => setLotBudget(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="buildBudget" className="block text-xs text-slate-500 mb-1.5">
                    Build budget (USD)
                  </label>
                  <input
                    id="buildBudget"
                    type="number"
                    min={0}
                    placeholder="e.g. 260000"
                    value={buildBudget}
                    onChange={(e) => setBuildBudget(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor="downPct" className="text-sm font-semibold text-slate-300">
                Down payment
              </label>
              <span className="text-sm font-bold text-white">
                {downPct}%{hasPrice && <span className="font-medium text-slate-500"> · {fmt(downAmount)}</span>}
              </span>
            </div>
            <input
              id="downPct"
              type="range"
              min={0}
              max={50}
              step={1}
              value={downPct}
              onChange={(e) => setDownPct(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-300 mb-2">Loan term</span>
            <div className="grid grid-cols-3 gap-2">
              {[15, 20, 30].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setTermYears(y)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    termYears === y
                      ? "bg-blue-500 text-white border-blue-500"
                      : "border-slate-600 text-slate-400 hover:border-blue-400"
                  }`}
                >
                  {y}yr
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="ratePct" className="block text-sm font-semibold text-slate-300 mb-1.5">
              Interest rate (%)
            </label>
            <input
              id="ratePct"
              type="number"
              min={0}
              max={20}
              step={0.05}
              value={ratePct}
              onChange={(e) => {
                rateEdited.current = true;
                const v = Number(e.target.value);
                setRatePct(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
              className={inputCls}
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              {rateMeta?.source === "fred"
                ? `Preloaded with the 30-yr fixed national average as of ${new Date(
                    rateMeta.asOf + "T00:00:00",
                  ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (FRED). Edit to match your lender's quote.`
                : "Starts at a typical recent average — edit to match your lender's quote."}
            </p>
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-4">
            Monthly payment (P&amp;I)
          </p>
          <p className="text-4xl font-extrabold text-blue-400 mb-1">
            {hasPrice ? fmt(monthlyPI) : "—"}
            <span className="text-base font-semibold text-slate-500"> / mo</span>
          </p>
          <p className="text-xs text-slate-500 mb-6">
            Principal &amp; interest only, {termYears}-yr fixed at {ratePct.toFixed(2)}%.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: "Loan amount", value: hasPrice ? fmt(loanAmount) : "—" },
              { label: "Down payment", value: hasPrice ? fmt(downAmount) : "—" },
              { label: "Total interest", value: hasPrice ? fmt(totalInterest) : "—" },
              { label: "Total of payments", value: hasPrice ? fmt(loanAmount + totalInterest) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-800/70 border border-slate-700/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {hasPrice && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3 mb-4">
              <p className="text-sm text-slate-300">
                ≈ <span className="font-bold text-white">{fmt(monthlyPI + taxInsMonthly)}</span> / mo
                with taxes &amp; insurance
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Estimate only — assumes ~{PROPERTY_TAX_PCT_PER_YEAR}%/yr property tax and ~
                {fmt(INSURANCE_USD_PER_YEAR)}/yr insurance as a national ballpark. Both vary by
                county and insurer.
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-600">
            Estimates for conversation, not a loan offer. HOA dues, PMI, and closing costs not
            included.
          </p>
        </div>
      </div>

      {/* ── Bridge to /try + founder line ─────────────────────────── */}
      <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <p className="text-sm text-slate-400 leading-relaxed">
          I built SplanAI so numbers like these show up inside a full buyer proposal — three home
          concepts, financing, and a shareable portal — instead of on a napkin.{" "}
          <a
            href="/try"
            onClick={() => track("tools_to_try_click", { tool: "payment_calculator" })}
            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            See a sample proposal — no signup →
          </a>
        </p>
      </div>
    </div>
  );
}
