"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@vercel/analytics";

interface MlsLotData {
  listingId: string;
  address?: string;
  lotSizeArea?: number;
  zoning?: string;
  city?: string;
  state?: string;
  mlsProvider?: string;
  attribution?: string;
  disclaimer?: string;
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

const FAMILY_OPTIONS = ["1 person", "2 people", "3 people", "4 people", "5 people", "6+ people"];

export default function GenerateClient() {
  const router = useRouter();
  const [form, setForm] = useState({ lotSize: "", budget: "", familySize: "", city: "", state: "", street: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mlsConnected, setMlsConnected] = useState(false);
  const [mlsListingId, setMlsListingId] = useState("");
  const [mlsLotData, setMlsLotData] = useState<MlsLotData | null>(null);
  const [mlsFetching, setMlsFetching] = useState(false);
  const [mlsFetchError, setMlsFetchError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
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
      setForm(prev => ({
        ...prev,
        lotSize: data.lotSizeArea ? String(Math.round(data.lotSizeArea)) : prev.lotSize,
        city: data.city ?? prev.city,
        state: data.state ?? prev.state,
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
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(mlsLotData?.zoning ? { mlsZoning: mlsLotData.zoning } : {}),
        }),
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

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-gray-900">
            Splan<span className="text-blue-600">AI</span>
          </a>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            ← Dashboard
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Generate Floor Plans</h1>
        <p className="text-sm text-gray-500 mb-8">Enter lot details to get 3 AI-generated proposals in ~30 seconds.</p>

        <form onSubmit={handleSubmit} className="bg-white border-2 border-slate-200 rounded-2xl shadow-xl p-8">
          {mlsConnected && (
            <div className="mb-5 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <label className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-2">
                🏠 MLS Listing # <span className="text-blue-400 font-normal">(optional — auto-fills lot data)</span>
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
            {([
              { label: "Lot Size (sq ft)", name: "lotSize", placeholder: "e.g. 8500", min: 1000 },
              { label: "Budget (USD)", name: "budget", placeholder: "e.g. 350000", min: 50000 },
            ] as const).map(f => (
              <div key={f.name} className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{f.label}</label>
                <input
                  type="number"
                  name={f.name}
                  value={form[f.name]}
                  onChange={handleChange}
                  placeholder={f.placeholder}
                  min={f.min}
                  required
                  className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-500 transition text-sm"
                />
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Family Size</label>
              <select
                name="familySize"
                value={form.familySize}
                onChange={handleChange}
                required
                className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 focus:outline-none focus:border-blue-500 transition text-sm bg-white"
              >
                <option value="">Select…</option>
                {FAMILY_OPTIONS.map((opt, i) => <option key={i} value={String(i + 1)}>{opt}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-2">Optional — adds neighborhood & market data</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">City</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="e.g. Austin"
                  maxLength={60}
                  className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">State</label>
                <input
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="e.g. TX"
                  maxLength={30}
                  className="px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-400">Street Address</label>
              <input
                type="text"
                name="street"
                value={form.street}
                onChange={handleChange}
                placeholder="e.g. 1234 Oak Lane, Austin, TX"
                maxLength={120}
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border-2 border-slate-100 text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 transition text-sm"
              />
              <p className="text-xs text-slate-300 mt-1">Optional — adds lot size & zoning data (coming soon)</p>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="mt-6 w-full py-4 rounded-xl text-white text-base font-bold transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            style={{ background: loading ? "#1D4ED8" : isValid ? "#3B82F6" : "#94A3B8" }}
          >
            {loading ? <><Spinner />Generating floor plans… (~30 sec)</> : "Generate 3 Plans →"}
          </button>
        </form>
      </div>
    </div>
  );
}
