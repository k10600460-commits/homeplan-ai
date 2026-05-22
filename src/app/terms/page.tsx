import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — SplanAI",
  description: "SplanAI Terms of Service",
  robots: "noindex",
};

const LAST_UPDATED = "May 22, 2026";
const CONTACT_EMAIL = "【MAIL_PLACEHOLDER】";

export default function TermsPage() {
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

          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-500 mb-10">Last updated: {LAST_UPDATED}</p>

          <div className="space-y-10 text-slate-700">

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">1. About SplanAI</h2>
              <p className="leading-relaxed">
                SplanAI is a software service that helps home builders generate AI-powered floor plan
                proposals, branded PDFs, and client-sharing tools. The service is operated as an
                individual business. By creating an account or using SplanAI, you agree to these Terms
                of Service. If you do not agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">2. Accounts</h2>
              <p className="leading-relaxed mb-3">
                You must provide a valid email address to create an account. You are responsible for
                maintaining the confidentiality of your account credentials and for all activity under
                your account. Notify us immediately at {CONTACT_EMAIL} if you suspect unauthorized access.
              </p>
              <p className="leading-relaxed">
                You must be at least 18 years old to use SplanAI. By creating an account, you represent
                that you are 18 or older and have the authority to enter into this agreement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">3. Pricing and Subscriptions</h2>

              <h3 className="font-semibold text-slate-800 mb-2 mt-4">Plans</h3>
              <p className="leading-relaxed mb-3">
                SplanAI offers three plans:
              </p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li><strong>Free</strong> — Up to 3 floor plan generations per month, at no cost.</li>
                <li><strong>Pro</strong> — Unlimited generations, branded PDF export, neighborhood &amp;
                    market data, and client sharing portal. $49/month after a 14-day free trial.</li>
                <li><strong>Team</strong> — Everything in Pro, plus multi-user access for 5–15 team
                    members and white-label PDF. $149/month after a 14-day free trial.</li>
              </ul>

              <h3 className="font-semibold text-slate-800 mb-2 mt-6">Free Trial</h3>
              <p className="leading-relaxed mb-3">
                Pro and Team plans include a 14-day free trial. A valid payment method is required at
                sign-up. You will not be charged during the trial period. If you do not cancel before
                the trial ends, your subscription will automatically convert to the paid plan.
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-6">Billing</h3>
              <p className="leading-relaxed mb-3">
                Payments are processed by Stripe. SplanAI does not store your payment card information.
                Subscriptions are billed monthly on the date your trial ended or your subscription
                started. All prices are in US dollars.
              </p>

              <h3 className="font-semibold text-slate-800 mb-2 mt-6">Cancellation</h3>
              <p className="leading-relaxed">
                You may cancel your subscription at any time from your dashboard. Cancellation takes
                effect at the end of the current billing period — you retain access until then. We do
                not offer refunds for partial billing periods.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">4. Your Responsibilities</h2>
              <p className="leading-relaxed mb-3">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-1 leading-relaxed">
                <li>Use the service for any unlawful purpose or in violation of any applicable law.</li>
                <li>Attempt to gain unauthorized access to any part of the service or its infrastructure.</li>
                <li>Resell, sublicense, or redistribute the service without our written permission.</li>
                <li>Use the service to generate content that is fraudulent, deceptive, or misleading.</li>
                <li>Share your account credentials with others (each account is for one user).</li>
              </ul>
              <p className="leading-relaxed mt-3">
                You are responsible for ensuring that any floor plan proposals you share with clients
                are clearly presented as preliminary AI-generated concepts and not as certified
                architectural drawings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">5. Intellectual Property</h2>
              <p className="leading-relaxed mb-3">
                SplanAI and its content (software, design, branding) are owned by the operator and
                are protected by applicable intellectual property laws.
              </p>
              <p className="leading-relaxed mb-3">
                Floor plan proposals generated through your use of SplanAI are provided to you for
                your business use. You may share them with your clients and use them in your sales
                process. You may not claim authorship of the underlying software or AI models.
              </p>
              <p className="leading-relaxed">
                If you upload your company logo for branded PDFs, you represent that you have the
                right to use that logo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">6. Disclaimers</h2>
              <p className="leading-relaxed mb-3">
                SplanAI provides floor plan proposals for preliminary sales and planning purposes only.
                The proposals are <strong>not certified architectural drawings</strong> and should not
                be used as a substitute for professional architectural or engineering services. Always
                consult a licensed architect or engineer before beginning construction.
              </p>
              <p className="leading-relaxed mb-3">
                Neighborhood data, market data, and mortgage estimates provided by SplanAI are sourced
                from third-party APIs (Google Maps, RentCast) and are provided for informational
                purposes only. SplanAI makes no warranties as to the accuracy, completeness, or
                timeliness of such data.
              </p>
              <p className="leading-relaxed">
                The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
                express or implied. To the fullest extent permitted by applicable law, SplanAI
                disclaims all warranties, including implied warranties of merchantability, fitness for
                a particular purpose, and non-infringement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">7. Limitation of Liability</h2>
              <p className="leading-relaxed">
                To the fullest extent permitted by law, SplanAI shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages, or any loss of profits or
                revenues, arising out of or related to your use of the service, even if SplanAI has
                been advised of the possibility of such damages. SplanAI&rsquo;s total liability for
                any claims related to the service shall not exceed the amount you paid to SplanAI in
                the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">8. Service Changes and Termination</h2>
              <p className="leading-relaxed mb-3">
                SplanAI reserves the right to modify, suspend, or discontinue any part of the service
                at any time with reasonable notice. We will notify you of material changes via email
                or a notice on the service.
              </p>
              <p className="leading-relaxed">
                We reserve the right to suspend or terminate your account if you violate these Terms.
                Upon termination, your right to use the service ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">9. Governing Law</h2>
              <p className="leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of the United
                States, without regard to conflict of law principles. Any disputes shall be resolved
                in a court of competent jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">10. Changes to These Terms</h2>
              <p className="leading-relaxed">
                We may update these Terms from time to time. If we make material changes, we will
                notify you by email or by posting a notice on SplanAI. Your continued use of the
                service after such notice constitutes your acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-3">11. Contact</h2>
              <p className="leading-relaxed">
                Questions about these Terms? Contact us at:{" "}
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
