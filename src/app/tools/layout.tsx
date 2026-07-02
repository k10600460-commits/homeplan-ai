import Link from "next/link";

/**
 * Shared shell for the free builder tools (/tools/*).
 * Mirrors the /try look: dark, minimal, no app chrome. Fully static —
 * every tool runs client-side; the only network call any tool makes is
 * the cached /api/mortgage-rate read.
 */
export default function ToolsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen w-full" style={{ background: "#0F172A", color: "#E2E8F0" }}>
      <header className="border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
            Splan<span className="text-blue-400">AI</span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link href="/tools" className="text-sm text-slate-400 hover:text-white transition-colors">
              All tools
            </Link>
            <a href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">{children}</main>

      <footer className="border-t border-slate-800/60 mt-4">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-300 transition-colors">SplanAI home</Link>
          <a href="/try" className="hover:text-slate-300 transition-colors">Try a sample proposal</a>
          <a href="/terms" className="hover:text-slate-300 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
