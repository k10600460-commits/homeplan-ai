"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";

export default function BlogTryCta({ slug }: { slug: string }) {
  return (
    <aside className="mt-16 p-6 rounded-xl border border-blue-200 bg-blue-50 text-center" aria-label="Try SplanAI">
      <h2 className="font-bold text-slate-900 text-lg">See what you could show a buyer</h2>
      <p className="text-slate-500 text-sm mt-1 mb-4">
        Enter a lot size and budget. Get one sample home concept without creating an account.
      </p>
      <Link href={`/try?source=blog&article=${encodeURIComponent(slug)}`}
        onClick={() => track("blog_try_click", { article: slug })}
        className="inline-block px-6 py-3 rounded-lg text-sm font-bold text-white bg-blue-500 hover:bg-blue-600">
        Try a sample, no signup →
      </Link>
      <p className="text-xs text-slate-500 mt-3">For early buyer conversations, not permit-ready plans or a construction quote.</p>
      <div className="flex justify-center flex-wrap gap-4 text-sm text-blue-700 mt-4">
        <Link href="/tools/lot-feasibility">Check a lot&apos;s buildable area</Link>
        <Link href="/tools/payment-calculator">Explore monthly payments</Link>
      </div>
    </aside>
  );
}
