import type { Metadata } from "next";

/**
 * Metadata for auth / utility pages that must never surface as a search result.
 *
 * These pages are deliberately NOT added to robots.ts PRIVATE_PATHS. A
 * robots.txt Disallow stops Googlebot from fetching the page at all, which
 * means it can never read this noindex — so a URL that is *already* indexed
 * stays indexed indefinitely, as a bare title-only result. Crawlable +
 * noindex is the combination that actually removes a page from the index;
 * blocking is only correct for URLs that were never indexed in the first place.
 *
 * Context (2026-08-15): Google had indexed exactly two splanai.com URLs, and
 * one of them was nz.splanai.com/login — ranked ahead of all 37 blog articles,
 * which Google had never been told about (the sitemap had not been re-read
 * since 2026-06-21).
 */
export const NOINDEX_METADATA: Metadata = {
  robots: { index: false, follow: false },
};
