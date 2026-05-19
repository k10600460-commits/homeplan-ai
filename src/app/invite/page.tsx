"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function InviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "auth" | "accepting" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("Invalid invitation link."); return; }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) acceptInvite(token);
      else setStatus("auth");
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acceptInvite(t: string) {
    setStatus("accepting");
    const res = await fetch("/api/team/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    if (data.success) {
      setStatus("done");
      setTimeout(() => router.push("/dashboard"), 2000);
    } else {
      setStatus("error");
      setErrorMsg(data.error ?? "Failed to accept invitation.");
    }
  }

  async function handleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/invite?token=${token}` },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
        <div className="text-3xl mb-4">🏠</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
          Splan<span className="text-blue-500">AI</span> Team Invitation
        </h1>

        {status === "loading" && <p className="text-gray-400 mt-4">Checking invitation…</p>}

        {status === "auth" && (
          <>
            <p className="text-gray-600 mb-6">Sign in to accept your team invitation and get full Team plan access.</p>
            <button
              onClick={handleSignIn}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
            >
              Sign in to Accept →
            </button>
            <p className="text-xs text-gray-400 mt-3">Sign in with the email address this invitation was sent to.</p>
          </>
        )}

        {status === "accepting" && <p className="text-gray-400 mt-4">Activating your team access…</p>}

        {status === "done" && (
          <>
            <div className="text-5xl mb-3">✅</div>
            <p className="text-gray-800 font-semibold">You've joined the team!</p>
            <p className="text-gray-500 text-sm mt-2">Redirecting to your dashboard…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-5xl mb-3">⚠️</div>
            <p className="text-red-600 font-semibold">{errorMsg}</p>
            <a href="/" className="inline-block mt-4 text-blue-600 hover:underline text-sm">Back to splanai.com</a>
          </>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-gray-400">Loading invitation…</p>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
