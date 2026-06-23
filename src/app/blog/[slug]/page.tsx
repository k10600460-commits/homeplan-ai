import { createClient } from "@supabase/supabase-js";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

interface Article {
  slug: string;
  title: string;
  description: string | null;
  draft_content: string | null;
  published_at: string;
  target_keyword: string;
}

async function getArticle(slug: string): Promise<Article | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from("seo_articles")
    .select("slug, title, description, draft_content, published_at, target_keyword")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Not Found | SplanAI" };

  const canonical = `https://splanai.com/blog/${article.slug}`;
  return {
    title: `${article.title} | SplanAI`,
    description: article.description ?? undefined,
    keywords: parseKeywords(article.target_keyword),
    alternates: { canonical },
    openGraph: {
      title: article.title,
      description: article.description ?? undefined,
      url: canonical,
      type: "article",
      publishedTime: article.published_at,
      images: [{ url: "https://splanai.com/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description ?? undefined,
      images: ["https://splanai.com/og-image.png"],
    },
    robots: { index: true, follow: true },
  };
}

// Strips the leading H1 from draft_content when it matches the article title,
// preventing double-render (template H1 already appears above the article body).
// Comparison ignores case, whitespace, and punctuation.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripLeadingTitleH1(content: string, title: string): string {
  const firstNewline = content.indexOf("\n");
  const firstLine = firstNewline === -1 ? content : content.slice(0, firstNewline);
  if (!firstLine.startsWith("# ")) return content;
  const headingText = firstLine.slice(2).trim();
  if (normalize(headingText) !== normalize(title)) return content;
  const rest = firstNewline === -1 ? "" : content.slice(firstNewline + 1).replace(/^\n+/, "");
  return rest;
}

function parseKeywords(targetKeyword: string): string[] | undefined {
  const keywords = targetKeyword
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  return keywords.length > 0 ? keywords : undefined;
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const canonical = `https://splanai.com/blog/${article.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description ?? undefined,
    datePublished: article.published_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    publisher: {
      "@type": "Organization",
      name: "SplanAI",
      url: "https://splanai.com",
      logo: { "@type": "ImageObject", url: "https://splanai.com/logo.png" },
    },
    image: "https://splanai.com/og-image.png",
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60" style={{ background: "#0F172A" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
            Splan<span className="text-blue-400">AI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-400">
            <Link href="/#how" className="hover:text-white transition-colors">How it works</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
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

      {/* Article */}
      <main className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/blog" className="text-sm text-blue-500 hover:text-blue-700 transition-colors font-medium">
          ← All articles
        </Link>

        <article className="mt-8">
          <header className="mb-8">
            <time className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              {formatDate(article.published_at)}
            </time>
            <h1 className="mt-3 text-3xl font-extrabold text-slate-900 leading-tight">
              {article.title}
            </h1>
            {article.description && (
              <p className="mt-4 text-lg text-slate-500 leading-relaxed">
                {article.description}
              </p>
            )}
          </header>

          <div className="blog-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripLeadingTitleH1(article.draft_content ?? "", article.title)}
            </ReactMarkdown>
          </div>
        </article>

        {/* CTA */}
        <div className="mt-16 p-6 rounded-xl border border-blue-200 bg-blue-50 text-center">
          <p className="font-bold text-slate-900 text-lg">Generate floor plans in 30 seconds</p>
          <p className="text-slate-500 text-sm mt-1 mb-4">Free to start — no credit card required.</p>
          <Link
            href="/#generate"
            className="inline-block px-6 py-3 rounded-lg text-sm font-bold text-white"
            style={{ background: "#3B82F6" }}
          >
            Try SplanAI Free →
          </Link>
        </div>
      </main>

      <footer className="text-center text-slate-400 text-sm py-10">
        © 2026 SplanAI. Built for home builders.
      </footer>
    </div>
  );
}
