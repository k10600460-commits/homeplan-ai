import { createClient } from "@supabase/supabase-js";
import { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog | SplanAI",
  description: "Insights and guides for home builders on floor plans, AI tools, and closing more deals.",
  alternates: { canonical: "https://splanai.com/blog" },
  openGraph: {
    title: "Blog | SplanAI",
    description: "Insights and guides for home builders on floor plans, AI tools, and closing more deals.",
    url: "https://splanai.com/blog",
    images: [{ url: "https://splanai.com/og-image.png", width: 1200, height: 630 }],
  },
};

interface Article {
  slug: string;
  title: string;
  description: string | null;
  published_at: string;
}

async function getPublishedArticles(): Promise<Article[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from("seo_articles")
    .select("slug, title, description, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[blog] fetch error:", error.message);
    return [];
  }
  return data ?? [];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPage() {
  const articles = await getPublishedArticles();

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60" style={{ background: "#0F172A" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-extrabold tracking-tight text-white">
            Splan<span className="text-blue-400">AI</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <a href="/#how" className="hover:text-white transition-colors">How it works</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/blog" className="text-white font-semibold">Blog</a>
          </nav>
          <a
            href="/login"
            className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
            style={{ background: "#3B82F6" }}
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-extrabold text-slate-900 mb-3">Blog</h1>
        <p className="text-slate-500 mb-12">Insights for home builders — floor plans, AI tools, and closing more deals.</p>

        {articles.length === 0 ? (
          <p className="text-slate-400 text-sm">No articles published yet. Check back soon.</p>
        ) : (
          <ul className="space-y-8">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link href={`/blog/${article.slug}`} className="group block">
                  <article className="p-6 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm transition-all">
                    <time className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                      {formatDate(article.published_at)}
                    </time>
                    <h2 className="mt-2 text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                      {article.title}
                    </h2>
                    {article.description && (
                      <p className="mt-2 text-slate-500 text-sm leading-relaxed line-clamp-2">
                        {article.description}
                      </p>
                    )}
                    <span className="mt-4 inline-block text-blue-500 text-sm font-semibold group-hover:text-blue-700 transition-colors">
                      Read more →
                    </span>
                  </article>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="text-center text-slate-400 text-sm py-10">
        © 2026 SplanAI. Built for home builders.
      </footer>
    </div>
  );
}
