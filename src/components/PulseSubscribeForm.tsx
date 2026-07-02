"use client";

import { useState } from "react";
import { PULSE_METROS } from "@/data/pulse-metros";

// Opt-in form for the weekly builder market digest. Stores the address via
// /api/pulse/subscribe — no email is sent today (sending is intentionally
// off until the digest launches), and the copy says so.

interface Props {
  /** Preselected metro slug (metro pages) or null (hub — shows a selector). */
  metro: string | null;
}

type FormState = "idle" | "submitting" | "done" | "error";

export function PulseSubscribeForm({ metro }: Props) {
  const [email, setEmail] = useState("");
  const [selectedMetro, setSelectedMetro] = useState<string>(metro ?? "all");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/pulse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, metro: selectedMetro === "all" ? null : selectedMetro }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErrorMsg(
        res.status === 429
          ? "Too many signups from this connection today — try again tomorrow."
          : data?.error === "invalid_email"
            ? "That email doesn't look right — mind checking it?"
            : "Couldn't save that just now. Try again in a minute.",
      );
      setState("error");
    } catch {
      setErrorMsg("Couldn't save that just now. Try again in a minute.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-bold">You&apos;re on the list.</p>
        <p className="mt-1">
          We&apos;ll start sending the weekly digest once it launches — nothing lands in your
          inbox before that, and you can unsubscribe from the first email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourcompany.com"
        aria-label="Email address"
        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
      />
      {metro === null && (
        <select
          value={selectedMetro}
          onChange={(e) => setSelectedMetro(e.target.value)}
          aria-label="Metro"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All metros</option>
          {PULSE_METROS.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}, {m.stateCode}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={state === "submitting"}
        className="rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
        style={{ background: "#3B82F6" }}
      >
        {state === "submitting" ? "Saving…" : "Get the weekly digest"}
      </button>
      {state === "error" && (
        <p className="text-sm text-red-600 sm:w-full" role="alert">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
