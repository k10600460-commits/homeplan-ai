"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "signup" ? "signup" : "signin";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If session is returned immediately (email confirmation disabled), go to checkout
    if (data.session) {
      await startCheckout(data.session.user.id, email);
      return;
    }

    // Email confirmation required
    setMessage("Check your email to confirm your account, then sign in.");
    setLoading(false);
  }

  async function startCheckout(userId: string, userEmail: string) {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email: userEmail }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      setError("Failed to start checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Nav */}
      <header className="flex items-center px-6 py-4 border-b border-gray-100 bg-white">
        <a href="/" className="text-xl font-bold tracking-tight text-gray-900">
          Splan<span className="text-blue-600">AI</span>
        </a>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => { setTab("signin"); setError(""); setMessage(""); }}
                className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                  tab === "signin"
                    ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                    : "text-gray-500 hover:text-gray-700 bg-gray-50"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setTab("signup"); setError(""); setMessage(""); }}
                className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                  tab === "signup"
                    ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                    : "text-gray-500 hover:text-gray-700 bg-gray-50"
                }`}
              >
                Start Free Trial
              </button>
            </div>

            <div className="px-8 py-8">
              {tab === "signin" ? (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
                  <p className="text-sm text-gray-500 mb-6">Sign in to your SplanAI account.</p>

                  <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-gray-700">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-gray-700">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : "Sign In"}
                    </button>
                  </form>

                  <p className="mt-6 text-center text-sm text-gray-500">
                    Don&apos;t have an account?{" "}
                    <button
                      onClick={() => { setTab("signup"); setError(""); }}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Start your free trial
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Start your free trial</h1>
                  <p className="text-sm text-gray-500 mb-4">14 days free, then $49/month. Cancel anytime.</p>

                  {/* Trial features */}
                  <div className="bg-blue-50 rounded-xl px-4 py-3 mb-6 flex flex-col gap-1.5">
                    {[
                      "14-day free trial — no charge today",
                      "Unlimited floor plan generation",
                      "PDF export with your branding",
                      "Cancel anytime before trial ends",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-blue-800">
                        <svg className="w-4 h-4 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {item}
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-gray-700">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-gray-700">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        minLength={8}
                        className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
                    )}
                    {message && (
                      <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-2">{message}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : "Start Free Trial →"}
                    </button>

                    <p className="text-xs text-center text-gray-400">
                      By signing up, you agree to our{" "}
                      <a href="/terms" className="underline hover:text-gray-600">Terms</a>
                      {" "}and{" "}
                      <a href="/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
                    </p>
                  </form>

                  <p className="mt-4 text-center text-sm text-gray-500">
                    Already have an account?{" "}
                    <button
                      onClick={() => { setTab("signin"); setError(""); }}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
