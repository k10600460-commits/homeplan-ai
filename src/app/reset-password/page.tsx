"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Suspense boundary required by Next.js App Router when using useSearchParams
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<VerifyingScreen />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header className="flex items-center px-6 py-4 border-b border-gray-100 bg-white">
      <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
        Splan<span className="text-blue-600">AI</span>
      </Link>
    </header>
  );
}

function VerifyingScreen() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavBar />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Verifying reset link…</p>
        </div>
      </div>
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // "verifying" = token exchange in progress; false = form or error can be shown
  const [verifying, setVerifying] = useState(true);
  const [linkError, setLinkError] = useState("");

  // Form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  const didVerify = useRef(false);

  useEffect(() => {
    // Guard against double-invocation in React StrictMode
    if (didVerify.current) return;
    didVerify.current = true;

    const code = searchParams.get("code");

    // ── PKCE flow: ?code=xxx ──────────────────────────────────────────────────
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        setVerifying(false);
        if (error || !data.session) {
          setLinkError("Invalid or expired reset link. Please request a new one.");
        } else {
          setVerifying(false);
        }
      });
      return;
    }

    // ── Implicit flow fallback: #access_token=xxx&type=recovery ──────────────
    // 5-second timeout prevents infinite loading if neither event fires
    const timeoutId = setTimeout(() => {
      setVerifying(false);
      setLinkError("Reset link verification timed out. Please request a new link.");
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        clearTimeout(timeoutId);
        setVerifying(false);
      }
    });

    // Handle page-reload case where session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearTimeout(timeoutId);
        setVerifying(false);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 3000);
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (verifying) return <VerifyingScreen />;

  // ── Link error ────────────────────────────────────────────────────────────
  if (linkError) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavBar />
        <div className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 px-8 py-8">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Link expired</h1>
              <p className="text-sm text-gray-500 mb-6">{linkError}</p>
              <Link
                href="/forgot-password"
                className="block text-center py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                Request a new reset link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavBar />
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden px-8 py-8">
            {success ? (
              <>
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mb-4">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Password updated</h1>
                <p className="text-sm text-gray-500">
                  Password updated successfully. Redirecting to your dashboard…
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Set new password</h1>
                <p className="text-sm text-gray-500 mb-6">
                  Choose a strong password for your SplanAI account.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">New password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="At least 12 characters"
                      minLength={12}
                      className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">Confirm new password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Re-enter your new password"
                      minLength={12}
                      className="px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>

                  {formError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{formError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : "Update password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
