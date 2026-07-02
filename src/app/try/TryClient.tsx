"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";

interface DemoRoom {
  name: string;
  sqft: number;
}

interface DemoPlan {
  name: string;
  style?: string;
  squareFootage?: number;
  bedrooms?: number;
  bathrooms?: number;
  stories?: number;
  garages?: number;
  estimatedCost?: number;
  description?: string;
  features?: string[];
  rooms?: DemoRoom[];
  highlights?: string[];
}

const BUDGET_OPTIONS = [
  { value: 250_000, label: "$250,000" },
  { value: 350_000, label: "$350,000" },
  { value: 500_000, label: "$500,000" },
];

function SignupCta({ where }: { where: string }) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <a
        href="/login?tab=signup"
        onClick={() => track("cta_click", { button: `try_demo_signup_${where}` })}
        className="px-6 py-3.5 rounded-xl text-white font-bold text-base shadow-lg transition-colors w-full sm:w-auto text-center"
        style={{ background: "#3B82F6", boxShadow: "0 0 24px rgba(59,130,246,0.3)" }}
      >
        Create your own in 30 seconds → Start free
      </a>
      <span className="text-xs text-slate-500">No credit card. 3 full proposals a month on the free plan.</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function TryClient({ token }: { token: string }) {
  const [form, setForm] = useState({ lotSize: "", budget: "350000", state: "" });
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<DemoPlan | null>(null);
  const [reused, setReused] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    track("try_demo_submit");
    try {
      const res = await fetch("/api/try-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotSize: form.lotSize,
          budget: Number(form.budget),
          state: form.state,
          website: honeypot,
          token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.plan) {
        setPlan(data.plan as DemoPlan);
        setReused(Boolean(data.reused));
        track("try_demo_result", { reused: Boolean(data.reused) });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again in a minute.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F172A", color: "#E2E8F0" }}>
      {/* ── Nav (minimal, mirrors LP) ─────────────────────────────── */}
      <header className="border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
            Splan<span className="text-blue-400">AI</span>
          </Link>
          <a href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
            Sign in
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {plan ? (
          /* ── Result view ─────────────────────────────────────────── */
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-white mb-2">
                {reused ? "Here's your sample again" : "Here's your sample concept"}
              </h1>
              <p className="text-slate-400 mb-5">
                {reused
                  ? "One sample per visitor — but signing up is free, and you get 3 full proposals a month."
                  : "Built from nothing but a lot size and a budget. Your buyers would see three of these, plus a live portal and a PDF."}
              </p>
              <SignupCta where="top" />
            </div>

            <div className="relative rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8 overflow-hidden">
              {/* Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
                <span className="text-[7rem] sm:text-[9rem] font-extrabold text-slate-500/10 -rotate-[24deg] tracking-widest">
                  SAMPLE
                </span>
              </div>
              <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Sample
              </span>

              <div className="relative">
                <p className="text-xs uppercase tracking-wider text-blue-400 font-bold mb-1">{plan.style ?? "Concept"}</p>
                <h2 className="text-2xl font-extrabold text-white mb-3">{plan.name}</h2>
                {plan.description && <p className="text-slate-300 leading-relaxed mb-6">{plan.description}</p>}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: "Sq Ft", value: plan.squareFootage?.toLocaleString() },
                    { label: "Beds / Baths", value: plan.bedrooms != null ? `${plan.bedrooms} / ${plan.bathrooms ?? "—"}` : undefined },
                    { label: "Stories · Garage", value: plan.stories != null ? `${plan.stories} · ${plan.garages ?? 0}-car` : undefined },
                    { label: "Est. Cost", value: plan.estimatedCost != null ? `$${plan.estimatedCost.toLocaleString()}` : undefined },
                  ]
                    .filter((s) => s.value)
                    .map((s) => (
                      <div key={s.label} className="rounded-lg bg-slate-800/70 border border-slate-700/60 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
                        <p className="text-sm font-bold text-white mt-0.5">{s.value}</p>
                      </div>
                    ))}
                </div>

                {Array.isArray(plan.highlights) && plan.highlights.length > 0 && (
                  <ul className="mb-6 space-y-1.5">
                    {plan.highlights.map((h, i) => (
                      <li key={i} className="text-sm text-slate-300 flex gap-2">
                        <span className="text-blue-400">✓</span> {h}
                      </li>
                    ))}
                  </ul>
                )}

                {Array.isArray(plan.rooms) && plan.rooms.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Room breakdown</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                      {plan.rooms.map((r, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-slate-800 py-1">
                          <span className="text-slate-300">{r.name}</span>
                          <span className="text-slate-500">{r.sqft?.toLocaleString?.() ?? r.sqft} sf</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                This sample is one concept with a watermark. On the free plan I give you the full flow:{" "}
                <span className="text-slate-200">3 concepts per run, buyer-ready PDF export, and a client portal</span>{" "}
                your buyers can open on their phone.
              </p>
              <SignupCta where="bottom" />
              <p className="text-xs text-slate-600 mt-4">
                SplanAI is early — founding builders get a direct line to me for feature requests.
              </p>
            </div>
          </div>
        ) : (
          /* ── Form view ───────────────────────────────────────────── */
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
              Try a sample proposal — no signup
            </h1>
            <p className="text-slate-400 leading-relaxed mb-8 max-w-xl">
              I built SplanAI so builders can answer &ldquo;what could we build on this lot?&rdquo; in about 30
              seconds instead of 3 days. Type in a lot size, pick a budget, and see one sample concept.
              One per visitor — the real thing does more.
            </p>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8 space-y-5">
              <div>
                <label htmlFor="lotSize" className="block text-sm font-semibold text-slate-300 mb-1.5">
                  Lot size (sq ft)
                </label>
                <input
                  id="lotSize"
                  type="number"
                  required
                  min={500}
                  max={1_000_000}
                  placeholder="e.g. 8500"
                  value={form.lotSize}
                  onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label htmlFor="budget" className="block text-sm font-semibold text-slate-300 mb-1.5">
                  Sample budget
                </label>
                <select
                  id="budget"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-400"
                >
                  {BUDGET_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-semibold text-slate-300 mb-1.5">
                  State <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  id="state"
                  type="text"
                  maxLength={2}
                  placeholder="e.g. TX"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 uppercase"
                />
              </div>

              {/* Honeypot — humans never see or fill this */}
              <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {error}{" "}
                  <a href="/login?tab=signup" className="underline font-semibold hover:text-white">
                    Start free
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-white font-bold transition-colors disabled:opacity-60"
                style={{ background: "#3B82F6" }}
              >
                {loading ? (<><Spinner /> Drawing up your sample…</>) : "Generate my sample →"}
              </button>

              <p className="text-xs text-slate-500 text-center">
                One sample per visitor · no email needed · takes about 30 seconds
              </p>
            </form>

            <p className="text-xs text-slate-600 mt-6 max-w-xl">
              The sample skips the parts I charge for: 3 concepts per run, PDF export, and the shareable
              client portal. Those come with the free plan — no card required.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
