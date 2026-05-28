import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SplanAI",
  description: "SplanAI Privacy Policy",
  robots: "noindex",
};

const LAST_UPDATED = "May 28, 2026";
const CONTACT_EMAIL = "hello@splanai.com";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8FAFC" }}>

      {/* Nav */}
      <header className="border-b border-slate-800/60" style={{ background: "#0F172A" }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-extrabold text-white tracking-tight">
            Splan<span className="text-blue-400">AI</span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            ← Back to home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-16 px-6">
        <div className="max-w-3xl mx-auto">

          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-slate-500 mb-10">Last updated: {LAST_UPDATED}</p>

          <div className="space-y-10 text-slate-700">

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">1. Overview</h2>
              <p className="leading-relaxed mb-3">
                SplanAI (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy.
                This Privacy Policy explains what information we collect when you use SplanAI,
                how we use it, and who we share it with. By using SplanAI, you agree to the
                practices described in this policy.
              </p>
              <p className="leading-relaxed">
                SplanAI is operated as an individual business based in Japan. If you have
                any questions about this Privacy Policy or your personal data, you can
                contact us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
                  {CONTACT_EMAIL}
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">2. Information We Collect</h2>

              <h3 className="font-semibold text-slate-800 mb-2 mt-4">Account Information</h3>
              <p className="leading-relaxed">
                When you create an account, we collect your email address and a hashed password.
                We do not collect your name, phone number, or physical address unless you
                voluntarily provide them (e.g., as a company name in the Team plan).
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-5">Floor Plan Inputs</h3>
              <p className="leading-relaxed">
                When you generate floor plans, we receive the inputs you provide: lot size, budget,
                family size, and optionally city, state, and street address. These inputs are sent
                to our AI provider to generate floor plan proposals. We do not store your street
                address beyond what is needed to fetch neighborhood and zoning data.
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-5">Shared Link Viewing (link_events)</h3>
              <p className="leading-relaxed">
                When you share a floor plan link with a client and they open it, we record that
                viewing event. Specifically, we log:
              </p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed mt-2">
                <li>A <strong>one-way hash (SHA-256)</strong> of the viewer&rsquo;s IP address — the raw IP is
                    never stored and cannot be recovered from the hash.</li>
                <li>The viewer&rsquo;s browser user agent string.</li>
                <li>The HTTP referrer (the page they came from), if provided.</li>
                <li>Which plan they viewed or selected, and when.</li>
              </ul>
              <p className="leading-relaxed mt-3">
                This data lets you, as the builder, know when your client has opened the link and
                which plan they engaged with. It is associated with your account, not with any
                identified individual on the viewer&rsquo;s side.
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-5">Usage Data</h3>
              <p className="leading-relaxed">
                We track how many floor plan generations you have made this month, and the
                approximate API cost of each generation, to enforce plan limits and calculate
                our own operational costs. This data is stored in our database and is not shared
                with third parties.
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-5">Page View Analytics</h3>
              <p className="leading-relaxed">
                We use Vercel Analytics to understand how visitors use our site. Vercel Analytics
                operates in a <strong>cookieless, beacon-based mode</strong> — it does not set any
                tracking cookies and does not track individual users across sessions. It collects
                only aggregate page view counts, referrers, and device types.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2 leading-relaxed">
                <li>To provide, operate, and improve the SplanAI service.</li>
                <li>To authenticate your account and maintain your session.</li>
                <li>To generate AI floor plan proposals based on your inputs.</li>
                <li>To enforce subscription plan limits (Free: 3 generations/month).</li>
                <li>To send you transactional emails: account welcome, trial reminders,
                    cancellation confirmation, and team invitations. We do not send marketing
                    emails without your consent.</li>
                <li>To alert us internally when external API usage approaches limits.</li>
                <li>To notify you when a client opens your shared floor plan link.</li>
              </ul>
              <p className="leading-relaxed mt-3">
                We do <strong>not</strong> sell your personal data. We do not use your data to train
                AI models. We do not send you unsolicited marketing emails.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">4. Third-Party Services</h2>
              <p className="leading-relaxed mb-4">
                SplanAI relies on the following third-party services. Each has its own privacy policy.
              </p>

              <div className="space-y-4">
                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Supabase</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Hosts our database and authentication system. Your account data, generated plans,
                    shared link records, and subscription information are stored in Supabase&rsquo;s
                    infrastructure. Data is protected with row-level security — only your own account
                    can access your data. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Supabase Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Google Maps Platform</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Used to geocode city/state inputs and retrieve nearby places (schools, hospitals,
                    grocery stores, safety data). When you enter a city and state, that location
                    string is sent to Google&rsquo;s API. We do not send any personal account information
                    to Google. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">RentCast</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Provides market rent and property sale price data for a given zip code. We send
                    only the zip code derived from your entered city/state to RentCast — no personal
                    account information is shared. <a href="https://rentcast.io/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">RentCast Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Stripe</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Handles all payment processing for Pro and Team subscriptions. SplanAI never
                    sees or stores your payment card number. Stripe may set its own cookies during
                    the checkout flow. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Stripe Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Anthropic (Claude AI)</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Powers the floor plan generation. Your lot size, budget, family size, and
                    optional location are included in prompts sent to Anthropic&rsquo;s API. Anthropic
                    does not use API inputs to train its models by default. <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Anthropic Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Vercel</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Hosts the SplanAI application and provides cookieless page view analytics.
                    Vercel may process request metadata (IP address, user agent) for routing and
                    security purposes. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Vercel Privacy Policy</a>
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-slate-200">
                  <p className="font-semibold text-slate-800">Resend</p>
                  <p className="text-sm leading-relaxed mt-1">
                    Delivers transactional emails (welcome, trial reminders, cancellations, team
                    invites). Your email address is shared with Resend solely to deliver these emails.
                    <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">Resend Privacy Policy</a>
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">5. Cookies</h2>
              <p className="leading-relaxed mb-3">
                SplanAI uses cookies only for authentication. When you log in, Supabase sets a
                session cookie (<code className="bg-slate-100 px-1 rounded text-sm">sb-*-auth-token</code>) to keep you signed in.
                This cookie is strictly necessary for the service to function and does not track
                your activity for advertising purposes.
              </p>
              <p className="leading-relaxed mb-3">
                Our page view analytics (Vercel Analytics) does <strong>not</strong> use cookies.
                It operates via a cookieless beacon and collects only aggregate, non-identifiable data.
              </p>
              <p className="leading-relaxed">
                During the Stripe checkout flow, Stripe may set its own cookies for fraud prevention
                and payment processing. These are governed by Stripe&rsquo;s own privacy policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">6. Data Retention</h2>
              <p className="leading-relaxed mb-3">
                We retain your account data and generated plans for as long as your account is
                active. Shared link viewing records (link_events) are retained indefinitely to
                support the notification and analytics features of the service.
              </p>
              <p className="leading-relaxed">
                If you request account deletion, we will delete your personal data within 30 days,
                except where retention is required by applicable law (e.g., financial records
                related to Stripe transactions).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">7. Your Rights</h2>
              <p className="leading-relaxed mb-3">
                Depending on your location, you may have the following rights regarding your
                personal data:
              </p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li><strong>Access:</strong> Request a copy of the data we hold about you.</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data.</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data.</li>
                <li><strong>Portability:</strong> Request your data in a portable format.</li>
                <li><strong>Opt-out:</strong> California residents may request that we not sell
                    their personal data. We do not sell personal data.</li>
              </ul>
              <p className="leading-relaxed mt-3">
                To exercise any of these rights, email us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
                  {CONTACT_EMAIL}
                </a>. We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">8. Children&rsquo;s Privacy</h2>
              <p className="leading-relaxed">
                SplanAI is not directed at children under 18. We do not knowingly collect personal
                information from children. If you believe a child has provided us with personal data,
                please contact us and we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">9. Changes to This Policy</h2>
              <p className="leading-relaxed">
                We may update this Privacy Policy from time to time. If we make material changes,
                we will notify you by email or by posting a notice on SplanAI before the change
                takes effect. The &ldquo;Last updated&rdquo; date at the top of this page reflects the most
                recent revision.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">10. Contact</h2>
              <p className="leading-relaxed">
                Questions or concerns about this Privacy Policy? Contact us at:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 px-6" style={{ background: "#0F172A", borderColor: "#1E293B" }}>
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <span>© 2026 SplanAI</span>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <Link href="/" className="hover:text-slate-300 transition-colors">Home</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
