"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ lotSize: "", budget: "", familySize: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
        router.push(
          `/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`,
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

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
    <>
      <div className="flex flex-col min-h-screen">
        {/* ===== Nav ===== */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            HomePlan<span className="text-blue-600">AI</span>
          </span>
          <nav className="flex items-center gap-6 text-sm text-gray-600">
            <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-gray-900 transition-colors">Reviews</a>
            {userEmail ? (
              <a
                href="/dashboard"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Dashboard
              </a>
            ) : (
              <a
                href="/login"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Sign in
              </a>
            )}
          </nav>
        </header>

        {/* ===== Hero ===== */}
        <main className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-xs font-semibold tracking-wide text-blue-700 uppercase bg-blue-50 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            AI-Powered Floor Plan Generator
          </div>

          <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-6xl">
            Turn any lot into a{" "}
            <span className="text-blue-600">floor plan</span>{" "}
            in 30 seconds
          </h1>

          <p className="mt-6 max-w-xl text-lg text-gray-500 leading-relaxed">
            Enter your lot details and let AI generate three custom floor plan
            proposals — ready to share as a PDF with your clients.
          </p>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="mt-12 w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-lg p-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">
                  Lot Size (sq ft)
                </label>
                <input
                  type="number"
                  name="lotSize"
                  value={form.lotSize}
                  onChange={handleChange}
                  placeholder="e.g. 8500"
                  min={1000}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">
                  Budget (USD)
                </label>
                <input
                  type="number"
                  name="budget"
                  value={form.budget}
                  onChange={handleChange}
                  placeholder="e.g. 350000"
                  min={50000}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label className="text-sm font-semibold text-gray-700">
                  Family Size
                </label>
                <select
                  name="familySize"
                  value={form.familySize}
                  onChange={handleChange}
                  required
                  className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                >
                  <option value="">Select…</option>
                  <option value="1">1 person</option>
                  <option value="2">2 people</option>
                  <option value="3">3 people</option>
                  <option value="4">4 people</option>
                  <option value="5">5 people</option>
                  <option value="6">6+ people</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!isValid || loading}
              className="mt-8 w-full py-4 rounded-xl bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating Plans…
                </>
              ) : (
                "Generate Plans →"
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-400">
            No credit card required &nbsp;·&nbsp; 3 free plans included
          </p>
        </main>

        {/* ===== How it works ===== */}
        <section id="how" className="bg-gray-50 py-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">How it works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Enter lot details", desc: "Provide lot size, budget, and family size." },
                { step: "2", title: "AI generates 3 plans", desc: "Claude AI designs three optimized floor plans in seconds." },
                { step: "3", title: "Share as PDF", desc: "Download and send polished proposals to your clients." },
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Testimonials ===== */}
        <section id="testimonials" className="py-20 px-6 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What builders are saying</h2>
            <p className="text-gray-500 mb-12">Trusted by home builders across the US</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
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
              ].map((t) => (
                <div
                  key={t.name}
                  className="bg-gray-50 rounded-2xl p-6 text-left flex flex-col gap-4 border border-gray-100"
                >
                  <div className="flex gap-1">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <svg key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">"{t.text}"</p>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Pricing ===== */}
        <section id="pricing" className="bg-gray-50 py-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-500 mb-12">Start free. Upgrade when you're ready.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
              {/* Free */}
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-left flex flex-col gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Free</p>
                  <p className="text-4xl font-extrabold text-gray-900 mt-1">$0</p>
                  <p className="text-sm text-gray-400 mt-1">No credit card required</p>
                </div>
                <ul className="flex flex-col gap-3 text-sm text-gray-600">
                  {[
                    "3 floor plan generations",
                    "PDF export included",
                    "All room types",
                    "Email support",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="/login"
                  className="mt-auto block text-center py-3 rounded-xl border border-blue-600 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
                >
                  Get started free
                </a>
              </div>

              {/* Pro */}
              <div className="bg-blue-600 rounded-2xl p-8 text-left flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute top-4 right-4 bg-white text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                  MOST POPULAR
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-200 uppercase tracking-wide">Pro</p>
                  <p className="text-4xl font-extrabold text-white mt-1">$49<span className="text-lg font-medium text-blue-200">/mo</span></p>
                  <p className="text-sm text-blue-200 mt-1">14-day free trial · Cancel anytime</p>
                </div>
                <ul className="flex flex-col gap-3 text-sm text-white">
                  {[
                    "Unlimited floor plan generations",
                    "PDF export with your logo",
                    "All room types",
                    "Priority support",
                    "Early access to new features",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="/login"
                  className="mt-auto block text-center py-3 rounded-xl bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
                >
                  Start 14-day free trial
                </a>
              </div>
            </div>

            <p className="mt-8 text-sm text-gray-400">
              All plans include PDF export · No hidden fees · Cancel anytime
            </p>
          </div>
        </section>

        {/* ===== Footer ===== */}
        <footer className="py-8 text-center text-sm text-gray-400 border-t border-gray-100">
          © 2026 HomePlanAI. Built for home builders.
        </footer>
      </div>
    </>
  );
}
