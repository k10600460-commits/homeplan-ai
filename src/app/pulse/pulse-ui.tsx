// Shared server-rendered UI for /pulse and /pulse/[metro].
// Design language mirrors the blog pages (slate palette, #0F172A header,
// #3B82F6 accents). No client code here — interactive bits live in
// src/components/PulseSubscribeForm.tsx / PulseViewPing.tsx.

import Link from "next/link";
import type { PulseRate } from "@/lib/pulse";
import { buildPaymentRows, fmtDate, fmtUsd, PULSE_DOWN_PCT, PULSE_TERM_YEARS } from "@/lib/pulse";

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function PulseHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/60" style={{ background: "#0F172A" }}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
          Splan<span className="text-blue-400">AI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
          <Link href="/pulse" className="hover:text-white transition-colors">Market Pulse</Link>
          <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
          <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
        </nav>
        <Link
          href="/login"
          className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
          style={{ background: "#3B82F6" }}
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

export function PulseFooter() {
  return (
    <footer className="text-center text-slate-400 text-sm py-10">
      © 2026 SplanAI. Built for home builders.
    </footer>
  );
}

/** The spec-required source line under every payment table. */
export function RateSourceLine({ rate }: { rate: PulseRate }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-slate-400">
      Rate source: Freddie Mac PMMS 30-yr fixed average via{" "}
      <a
        href="https://fred.stlouisfed.org/series/MORTGAGE30US"
        rel="noopener noreferrer"
        className="underline hover:text-slate-600"
      >
        FRED series MORTGAGE30US
      </a>{" "}
      (served by SplanAI&apos;s /api/mortgage-rate) · as of {fmtDate(rate.asOf)}. Payments are
      principal &amp; interest only on a {PULSE_TERM_YEARS}-year fixed loan with {PULSE_DOWN_PCT}%
      down — taxes, insurance, and HOA dues are not included. This is a national average; local
      quotes vary.
    </p>
  );
}

export function PaymentTable({ rate }: { rate: PulseRate }) {
  const rows = buildPaymentRows(rate.pct);
  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        30-year fixed average this week:{" "}
        <span className="text-2xl font-extrabold text-slate-900">{rate.pct.toFixed(2)}%</span>{" "}
        <span className="text-xs text-slate-400">(as of {fmtDate(rate.asOf)})</span>
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Home price</th>
              <th className="px-4 py-3 font-semibold">{PULSE_DOWN_PCT}% down</th>
              <th className="px-4 py-3 font-semibold">Loan amount</th>
              <th className="px-4 py-3 font-semibold">Monthly P&amp;I</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.price} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-bold text-slate-900">{fmtUsd(r.price)}</td>
                <td className="px-4 py-3 text-slate-500">{fmtUsd(r.downPayment)}</td>
                <td className="px-4 py-3 text-slate-500">{fmtUsd(r.loanAmount)}</td>
                <td className="px-4 py-3 font-bold text-blue-600">{fmtUsd(r.monthly)}/mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RateSourceLine rate={rate} />
    </div>
  );
}

/** Honest placeholder when no snapshot row exists yet (fabrication-zero). */
export function UpdatingNote({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
      Updating — {what} appears here after the next weekly refresh. We only show figures with a
      source and an as-of date, so this stays blank rather than estimated.
    </div>
  );
}

/** Small banner when the latest snapshot recorded partial source failures. */
export function PartialSnapshotNote() {
  return (
    <p className="text-xs text-slate-400">
      Some sources didn&apos;t refresh in this week&apos;s snapshot; affected figures show n/a
      until the next run.
    </p>
  );
}
