"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// useSearchParams requires a Suspense boundary in Next.js App Router
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<VerifyingScreen />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

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

function LinkExpiredScreen({ message }: { message: string }) {
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
            <p className="text-sm text-gray-500 mb-6">{message}</p>
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

// ── Main content ──────────────────────────────────────────────────────────────

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Derive initial state from URL params synchronously — avoids setState-in-effect warning.
  // ?error=link_expired  → callback route signalled a failed code exchange
  // ?token_hash=xxx      → Supabase OTP direct link (no PKCE verifier needed)
  // (nothing)            → normal path: session already set by /auth/callback
  const errorParam  = searchParams.get("error");
  const tokenHash   = searchParams.get("token_hash");
  const typeParam   = searchParams.get("type");

  const isExpiredUrl   = errorParam === "link_expired";
  const isTokenHashUrl = Boolean(tokenHash && typeParam === "recovery");

  // When the error is already known from the URL, skip verifying immediately.
  const [verifying, setVerifying] = useState(!isExpiredUrl);
  const [linkError, setLinkError] = useState(
    isExpiredUrl
      ? "This reset link has expired or already been used. Please request a new one."
      : "",
  );

  // Form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  const didRun = useRef(false);

  useEffect(() => {
    // Already resolved synchronously from URL params above
    if (isExpiredUrl) return;

    if (didRun.current) return;
    didRun.current = true;

    // ── Path A: token_hash direct link ────────────────────────────────────────
    // Supabase sends ?token_hash=xxx&type=recovery directly to our page.
    // verifyOtp does not need a PKCE code_verifier.
    if (isTokenHashUrl && tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error }) => {
        setVerifying(false);
        if (error) setLinkError("Invalid or expired reset link. Please request a new one.");
        // on success: verifying=false, linkError="" → form renders
      });
      return;
    }

    // ── Path B (main): /auth/callback established the session server-side. ────
    // The Supabase server-side client (createServerClient) exchanged the code and
    // wrote the session into cookies. getSession() reads it immediately.
    // 5s timeout guards against unexpected cases (no redirect from callback, etc.).
    const timeoutId = setTimeout(() => {
      setVerifying(false);
      setLinkError("Reset link verification timed out. Please request a new one.");
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeoutId);
      setVerifying(false);
      if (!session) {
        setLinkError(
          "No active session found. Please use the link from your email, or request a new one.",
        );
      }
    });

    return () => clearTimeout(timeoutId);
  }, [isExpiredUrl, isTokenHashUrl, tokenHash, supabase.auth]);

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

  // ── Render states ─────────────────────────────────────────────────────────
  if (verifying) return <VerifyingScreen />;
  if (linkError)  return <LinkExpiredScreen message={linkError} />;

  // ── Password form ─────────────────────────────────────────────────────────
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
