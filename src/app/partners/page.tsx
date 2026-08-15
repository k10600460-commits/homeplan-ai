import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partners — Get paid when builders you refer sign up | SplanAI",
  description:
    "Refer a home builder to SplanAI and earn 30% of their subscription for their first 12 months. Paid monthly, no minimum traffic, no exclusivity.",
  alternates: { canonical: "/partners" },
  openGraph: {
    title: "Know builders? Get paid when they sign up.",
    description:
      "Earn 30% of every referred subscription for 12 months. No minimum traffic, no exclusivity.",
    url: "/partners",
    type: "website",
  },
};

const CONTACT_EMAIL = "hello@splanai.com";

// Commission illustration is derived from the live plan prices (Pro $49 / Team $149)
// at 30% for 12 months. Keep in sync with the pricing section on the homepage.
const TIERS = [
  { plan: "Pro", price: "$49/mo", perMonth: "$14.70", perYear: "up to $176" },
  { plan: "Team", price: "$149/mo", perMonth: "$44.70", perYear: "up to $536" },
];

const STEPS = [
  {
    n: "1",
    title: "Tell us where you'd share it",
    body: `Email ${CONTACT_EMAIL} with a line about your audience — a newsletter, a channel, a client list, or just the builders you already talk to.`,
  },
  {
    n: "2",
    title: "We send your code and link",
    body: "Your code is tied to you in Stripe, so anything it touches is attributed to you. Nothing to install, no dashboard to learn.",
  },
  {
    n: "3",
    title: "We reconcile monthly",
    body: "We check referrals against Stripe each month and pay out by Wise or PayPal once you clear $50.",
  },
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">

      {/* Nav */}
      <header className="border-b border-slate-800/60 bg-slate-900">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-extrabold text-white tracking-tight">
            Splan<span className="text-blue-400">AI</span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1">

        {/* Hero */}
        <section className="px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Know builders?{" "}
              <span className="text-blue-400">Get paid when they sign up.</span>
            </h1>

            <p className="mt-6 text-lg text-slate-300 leading-relaxed">
              SplanAI turns a lot into three concept directions a builder can put in front of a
              buyer — in about 30 seconds. If you write for builders, consult for them, or just
              know a few, share your link. When someone you refer becomes a paying customer, you
              get <strong className="text-white">30% of their subscription for their first 12
              months</strong>.
            </p>

            <p className="mt-4 text-slate-400">
              Paid monthly. No minimum traffic, no exclusivity, no cost to join.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 sm:items-center">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=SplanAI%20Partners&body=Where%20I%27d%20share%20it%3A%0D%0AAudience%20%2F%20size%3A%0D%0ALink%20to%20my%20site%20or%20channel%3A%0D%0A`}
                className="px-7 py-4 rounded-xl text-white font-bold text-base bg-blue-500 hover:bg-blue-600 shadow-[0_0_30px_rgba(59,130,246,0.35)] transition-colors text-center"
              >
                Ask for your link →
              </a>
              <Link
                href="/try"
                className="px-7 py-4 rounded-xl font-semibold text-base border-2 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-center"
              >
                See what it produces first
              </Link>
            </div>
          </div>
        </section>

        {/* What you earn */}
        <section className="px-6 py-12 border-t border-slate-800/60">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white">What a referral is worth</h2>
            <p className="mt-3 text-slate-400">
              30% of what they pay, every month, for their first year. If they stay past that, the
              relationship is yours to keep working — we just stop billing you into it.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {TIERS.map((t) => (
                <div
                  key={t.plan}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
                >
                  <div className="text-sm font-semibold uppercase tracking-wide text-blue-400">
                    {t.plan}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{t.price}</div>
                  <div className="mt-4 text-3xl font-extrabold text-white">{t.perMonth}</div>
                  <div className="text-sm text-slate-400">per month, per customer</div>
                  <div className="mt-3 text-sm text-slate-300">{t.perYear} over 12 months</div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Figures assume the customer stays subscribed. Commissions are earned as they pay, so
              a cancellation stops future commission but never claws back what you already earned.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-12 border-t border-slate-800/60">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white">How it works</h2>

            <div className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <div key={s.n} className="flex gap-5">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold">
                    {s.n}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{s.title}</h3>
                    <p className="mt-1 text-slate-400 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Honest context — helps partners judge the offer */}
        <section className="px-6 py-12 border-t border-slate-800/60">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white">Worth knowing before you sign up</h2>
            <ul className="mt-6 space-y-3 text-slate-400">
              <li className="flex gap-3">
                <span className="text-blue-400 shrink-0">·</span>
                <span>
                  SplanAI is early. There is no case-study library to point at yet — the honest
                  pitch is the output itself, so try it before you recommend it.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-400 shrink-0">·</span>
                <span>
                  It fits small and mid-size home builders — roughly 10 to 50 homes a year — and
                  the people who advise them. It is a sales tool, not a design tool.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-400 shrink-0">·</span>
                <span>
                  Anyone can start free, with no card, so the people you send have a low-risk way
                  to judge it for themselves.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Fine print */}
        <section className="px-6 py-12 border-t border-slate-800/60">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-lg font-bold text-white">Fine print</h2>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              No self-referrals. No bidding on SplanAI brand keywords. No bulk unsolicited email.
              We can end the program with 30 days&apos; notice; commissions you have already earned
              are always paid out. We reserve the right to decline or remove a partner whose
              promotion misrepresents the product.
            </p>

            <div className="mt-10">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=SplanAI%20Partners&body=Where%20I%27d%20share%20it%3A%0D%0AAudience%20%2F%20size%3A%0D%0ALink%20to%20my%20site%20or%20channel%3A%0D%0A`}
                className="inline-block px-7 py-4 rounded-xl text-white font-bold bg-blue-500 hover:bg-blue-600 transition-colors"
              >
                Ask for your link →
              </a>
              <p className="mt-3 text-sm text-slate-500">
                Or just write to {CONTACT_EMAIL} with a question.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6 bg-slate-900">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-lg font-extrabold text-white">
            Splan<span className="text-blue-400">AI</span>
          </span>
          <p className="text-sm text-slate-500">© 2026 SplanAI. Built for home builders.</p>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <Link href="/terms" className="py-2 hover:text-slate-300 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="py-2 hover:text-slate-300 transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
