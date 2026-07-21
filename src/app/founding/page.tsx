import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founding Builder — SplanAI",
  description:
    "Send a real lot and get a buyer-ready proposal your team reviews before it's shared. Founding builders get it done-for-you every month — $99/mo, cancel anytime, 14-day money-back guarantee.",
  robots: { index: false, follow: false }, // private outreach offer — not for public indexing
};

// Stripe Payment Link for the Founding Builder subscription ($99/mo, charged immediately, no trial).
// Set NEXT_PUBLIC_FOUNDING_CHECKOUT_URL in Vercel once the Stripe Payment Link exists.
// Until then the button falls back to a founder email so it is never a dead link.
const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_FOUNDING_CHECKOUT_URL ||
  "mailto:hello@splanai.com?subject=Founding%20Builder%20%E2%80%94%20start&body=I%27d%20like%20to%20start%20a%20Founding%20Builder%20subscription.%0D%0ALot%20address%20or%20link%3A%0D%0ABuyer%20requirements%20(beds%2Fbaths%2Fbudget)%3A";

const FEATURES = [
  "Up to 3 live-lot proposals a month, built for you",
  "A shareable buyer portal for each concept",
  "I confirm the build-price and payment assumptions with you before anything is shared",
  "Cancel anytime",
  "14-day money-back guarantee",
];

function Check() {
  return (
    <svg
      className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function FoundingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100">
      {/* Nav */}
      <header className="border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-extrabold tracking-tight text-white">
            Splan<span className="text-blue-400">AI</span>
          </a>
          <a
            href="/s/nfhkewvz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            See a sample →
          </a>
        </div>
      </header>

      {/* Offer */}
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-4">
            Founding Builder
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.1] tracking-tight text-white mb-5">
            Your next live lots, <span className="text-blue-400">done for you.</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed mb-10 max-w-xl">
            Send a real lot and the buyer requirements. I prepare a buyer-ready proposal your team
            reviews before anything is shared. Founding builders get it done-for-you, every month.
          </p>

          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-8 max-w-lg">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-extrabold text-white">$99</span>
              <span className="text-slate-400 font-semibold">/ month</span>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Cancel anytime · your current lot can be the first project.
            </p>

            <ul className="flex flex-col gap-3 mb-8">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-slate-200 text-[15px] leading-snug">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <a
              href={CHECKOUT_URL}
              className="block w-full text-center px-7 py-4 rounded-xl text-white font-bold text-base bg-blue-500 hover:bg-blue-600 shadow-[0_0_30px_rgba(59,130,246,0.35)] transition-colors"
            >
              Start — $99/month
            </a>
            <p className="text-center text-xs text-slate-500 mt-3">
              After you start, I&apos;ll reach out within 24 hours to build your first lot.
            </p>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            No long-term contract · You approve the numbers first · Work directly with the founder
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-800/60">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-slate-500">
          © 2026 SplanAI. Built for home builders.
        </div>
      </footer>
    </div>
  );
}
