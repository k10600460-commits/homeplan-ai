/**
 * The real sample the landing page shows: the live client portal /s/nfhkewvz
 * ("SplanAI Demo Builder" → "Sample Homeowner"). Values were copied from
 * production `shared_links` on 2026-09-18 and are pinned by lp-sample.test.ts.
 * The portal is the source of truth — if it changes, change this and the test
 * together. Nothing here is invented (DESIGN.md: 数字は全て実物).
 */
import { LP_ROUTES } from "./lp-routes";

export interface SamplePlan {
  name: string;
  style: string;
  sqft: number;
  /** Builder's estimated cost in USD; the portal shows cost … cost × 1.1 */
  cost: number;
  beds: number;
  baths: number;
  stories: number;
}

export const SAMPLE_PORTAL = {
  slug: "nfhkewvz",
  href: LP_ROUTES.livePortal,
  plans: [
    { name: "The Ridgewood Craftsman", style: "Craftsman Bungalow", sqft: 2650, cost: 622500, beds: 3, baths: 2.5, stories: 2 },
    { name: "The Solana Modern", style: "Contemporary Modern", sqft: 2900, cost: 812000, beds: 3, baths: 3, stories: 1 },
    { name: "The Cloverfield Farmhouse", style: "Modern Farmhouse", sqft: 2800, cost: 756000, beds: 3, baths: 2.5, stories: 2 },
  ] as const satisfies readonly SamplePlan[],
} as const;

/** Mirrors the portal's rendering: "$623–$685K" = cost … cost × 1.1, in thousands. */
export function formatCostRange(cost: number): string {
  const lo = Math.round(cost / 1000);
  const hi = Math.round((cost * 1.1) / 1000);
  return `$${lo}–$${hi}K`;
}

export function formatSqft(sqft: number): string {
  return sqft.toLocaleString("en-US");
}

/** Dimension-line label: smallest to largest concept, e.g. "2,650–2,900". */
export function sampleSqftRange(): string {
  const sizes = SAMPLE_PORTAL.plans.map((p) => p.sqft);
  return `${formatSqft(Math.min(...sizes))}–${formatSqft(Math.max(...sizes))}`;
}
