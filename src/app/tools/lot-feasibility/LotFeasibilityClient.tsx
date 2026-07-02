"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import {
  BUDGET_BANDS,
  MAX_LOT_SQFT,
  MIN_LOT_SQFT,
  getFeasibilityHints,
  type BudgetBandId,
  type FeasibilityHints,
} from "@/lib/lot-feasibility";

// Everything on this page is computed in the browser from general rules of
// thumb — no server calls, no limits. That's deliberate: /try (the sample
// proposal) is one per visitor, so this stays the tool you can hammer on.

export default function LotFeasibilityClient() {
  const [state, setState] = useState("");
  const [lotSize, setLotSize] = useState("");
  const [bandId, setBandId] = useState<BudgetBandId>("250k-400k");
  const [hints, setHints] = useState<FeasibilityHints | null>(null);

  useEffect(() => {
    track("tools_view", { tool: "lot_feasibility" });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sqft = Number(lotSize);
    if (!Number.isFinite(sqft) || sqft <= 0) return;
    setHints(getFeasibilityHints({ lotSqft: sqft, budgetBandId: bandId, state }));
  }

  const inputCls =
    "w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400";

  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
        Lot Feasibility Checker
      </h1>
      <p className="text-slate-400 leading-relaxed mb-8 max-w-xl">
        A gut check before the first client call: three questions, and you get the general-rules
        read on the lot — plus the short list of things worth verifying locally before you promise
        anything. No signup, use it as often as you like.
      </p>

      {/* ── The three questions ─────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8 space-y-5"
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="state" className="block text-sm font-semibold text-slate-300 mb-1.5">
              State <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              id="state"
              type="text"
              maxLength={2}
              placeholder="e.g. TX"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={`${inputCls} uppercase`}
            />
          </div>

          <div>
            <label htmlFor="lotSize" className="block text-sm font-semibold text-slate-300 mb-1.5">
              Lot size (sq ft)
            </label>
            <input
              id="lotSize"
              type="number"
              required
              min={MIN_LOT_SQFT}
              max={MAX_LOT_SQFT}
              placeholder="e.g. 8500"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="band" className="block text-sm font-semibold text-slate-300 mb-1.5">
              Budget band
            </label>
            <select
              id="band"
              value={bandId}
              onChange={(e) => setBandId(e.target.value as BudgetBandId)}
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-400"
            >
              {BUDGET_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl py-3.5 text-white font-bold transition-colors"
          style={{ background: "#3B82F6" }}
        >
          Check feasibility →
        </button>
      </form>

      {/* ── Hints ───────────────────────────────────────────────── */}
      {hints && (
        <div className="mt-8">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-wider text-blue-400 font-bold mb-1">
              General read — not a zoning opinion
            </p>
            <h2 className="text-2xl font-extrabold text-white mb-5">{hints.lotLabel}</h2>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-slate-300 leading-relaxed">{hints.lotNote}</p>
              <p className="text-sm text-slate-300 leading-relaxed">{hints.budgetNote}</p>
              <p className="text-sm text-slate-300 leading-relaxed">{hints.fitNote}</p>
              <p className="text-sm text-slate-400 leading-relaxed">{hints.stateNote}</p>
            </div>

            <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-4 mb-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2.5">
                Verify locally before promising anything
              </p>
              <ul className="space-y-1.5">
                {hints.checklist.map((item, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-blue-400">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-slate-500">{hints.disclaimer}</p>
          </div>

          {/* ── Bridge to /try ─────────────────────────────────── */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              This is the gut check. The next step with a real buyer is showing them what the lot
              could become — SplanAI turns the same three inputs into a sample home concept.
            </p>
            <a
              href="/try"
              onClick={() => track("tools_to_try_click", { tool: "lot_feasibility" })}
              className="inline-block px-6 py-3.5 rounded-xl text-white font-bold text-base shadow-lg transition-colors"
              style={{ background: "#3B82F6", boxShadow: "0 0 24px rgba(59,130,246,0.3)" }}
            >
              See it as a real proposal → Try a sample (no signup)
            </a>
            <p className="text-xs text-slate-500 mt-3">
              The sample is one per visitor — this checker stays unlimited.
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-10 max-w-xl">
        I&rsquo;m building SplanAI in the open for small builders — if this checker saved you a
        phone call or missed something obvious, I genuinely want to hear it: hello@splanai.com.
      </p>
    </div>
  );
}
