"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <UpgradeContent />
    </Suspense>
  );
}

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const current = Number(searchParams.get("current") ?? 0);
  const limit   = Number(searchParams.get("limit") ?? 5);
  const plan    = searchParams.get("plan") ?? "free";

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  async function handleUpgrade() {
    if (!userId || !email) {
      router.push("/login");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-gray-900">
            Splan<span className="text-blue-600">AI</span>
          </a>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Dashboard
          </a>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          {/* Usage bar card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Monthly limit reached</h2>
                <p className="text-sm text-gray-500">
                  {plan === "free" ? "Free plan" : "Current plan"}: {current} / {limit} generations used
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (current / limit) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-right">Resets on the 1st of next month</p>
          </div>

          {/* Upgrade card */}
          <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-lg p-8">
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide mb-4">
                SplanAI Pro
              </span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-extrabold text-gray-900">$49</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">14-day free trial • Cancel anytime</p>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                "100 floor plan generations per month",
                "PDF export with your company branding",
                "Shareable client links",
                "Priority support",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
                  <svg className="w-5 h-5 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : "Upgrade to Pro →"}
            </button>

            <p className="text-xs text-center text-gray-400 mt-4">
              No charge today. Card required to start your free trial.
            </p>
          </div>

          <p className="text-center mt-6">
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Go back
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
