import { NOINDEX_METADATA } from "@/lib/seo-noindex";

// The page itself is a client component and cannot export metadata, so this
// passthrough layout carries the noindex. See seo-noindex.ts for why these
// paths stay crawlable instead of being blocked in robots.txt.
export const metadata = NOINDEX_METADATA;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
