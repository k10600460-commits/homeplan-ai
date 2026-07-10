import type { NextRequest } from "next/server";

export const MARKET_CODES = ["us", "au", "nz", "ca"] as const;
export type Market = (typeof MARKET_CODES)[number];
export type AreaUnit = "sqft" | "m2";
export type LotDataProviderId = "manual" | "us-trestle";

const CHANGEABLE_MARKET_FIGURES = {
  us: { buildCostLow: null, buildCostHigh: null }, // TODO(market-figure): replace with sourced US build-cost dollars.
  au: { buildCostLow: null, buildCostHigh: null }, // TODO(market-figure): replace with sourced AU build-cost dollars.
  nz: { buildCostLow: null, buildCostHigh: null }, // TODO(market-figure): replace with sourced NZ build-cost dollars.
  ca: { buildCostLow: null, buildCostHigh: null }, // TODO(market-figure): replace with sourced CA build-cost dollars.
} as const;

export interface MarketPack {
  market: Market;
  label: string;
  hostname: string;
  hrefLang: "en-us" | "en-au" | "en-nz" | "en-ca";
  locale: string;
  currency: "USD" | "AUD" | "NZD" | "CAD";
  areaUnit: AreaUnit;
  lotDataProvider: LotDataProviderId;
  financeDefaults: {
    downPct: number;
    termYears: number;
    mortgageRatePct: number;
  };
  vocab: {
    stateLabel: string;
    lotSizeLabel: string;
    budgetLabel: string;
    sqftLabel: string;
    cityPlaceholder: string;
    statePlaceholder: string;
    streetPlaceholder: string;
  };
  legalFooter: string;
  figures: (typeof CHANGEABLE_MARKET_FIGURES)[Market];
}

export const MARKET_PACKS: Record<Market, MarketPack> = {
  us: {
    market: "us",
    label: "United States",
    hostname: "splanai.com",
    hrefLang: "en-us",
    locale: "en-US",
    currency: "USD",
    areaUnit: "sqft",
    lotDataProvider: "manual",
    financeDefaults: { downPct: 20, termYears: 30, mortgageRatePct: 6.5 },
    vocab: {
      stateLabel: "State",
      lotSizeLabel: "Lot Size (sq ft)",
      budgetLabel: "Budget (USD)",
      sqftLabel: "sq ft",
      cityPlaceholder: "e.g. Austin",
      statePlaceholder: "e.g. TX",
      streetPlaceholder: "e.g. 1234 Oak Lane, Austin, TX",
    },
    legalFooter: "Verify local zoning, permitting, taxes, insurance, and professional requirements before relying on any concept.",
    figures: CHANGEABLE_MARKET_FIGURES.us,
  },
  au: {
    market: "au",
    label: "Australia",
    hostname: "au.splanai.com",
    hrefLang: "en-au",
    locale: "en-AU",
    currency: "AUD",
    areaUnit: "m2",
    lotDataProvider: "manual",
    // AU: variable-rate dominant, ~25-30yr amortization, 20% deposit (LMI applies below 80% LVR).
    // mortgageRatePct = FALLBACK only; live RBA rate (F5/F6 tables, CSV — no public API) is a later phase.
    financeDefaults: { downPct: 20, termYears: 30, mortgageRatePct: 6.8 }, // fallback only; live via RBA F5 FILRHLBVD (verified ~6.80% 2026-06).
    vocab: {
      stateLabel: "State / Territory",
      lotSizeLabel: "Lot size (m2)",
      budgetLabel: "Budget (AUD)",
      sqftLabel: "m2",
      cityPlaceholder: "e.g. Brisbane",
      statePlaceholder: "e.g. QLD",
      streetPlaceholder: "e.g. 12 Wattle St, Brisbane QLD",
    },
    legalFooter: "Verify local planning controls, approvals, taxes, insurance, and professional requirements before relying on any concept.",
    figures: CHANGEABLE_MARKET_FIGURES.au,
  },
  nz: {
    market: "nz",
    label: "New Zealand",
    hostname: "nz.splanai.com",
    hrefLang: "en-nz",
    locale: "en-NZ",
    currency: "NZD",
    areaUnit: "m2",
    lotDataProvider: "manual",
    // NZ: short-term FIXED dominant (2yr most popular), ~25-30yr amortization, 20% deposit.
    // mortgageRatePct = labeled ESTIMATE shown in-product; no compliant free live feed yet
    // (RBNZ B20 is XLSX/WAF-blocked; Squirrel & interest.co.nz forbid redistribution).
    // indicative ~NZ 2yr special band 5.1–5.3 (Fable5 精査 2026-07-10); TODO(monthly-manual-review).
    financeDefaults: { downPct: 20, termYears: 30, mortgageRatePct: 5.2 },
    vocab: {
      stateLabel: "Region",
      lotSizeLabel: "Section size (m2)",
      budgetLabel: "Budget (NZD)",
      sqftLabel: "m2",
      cityPlaceholder: "e.g. Christchurch",
      statePlaceholder: "e.g. Canterbury",
      streetPlaceholder: "e.g. 12 Kowhai Lane, Christchurch",
    },
    legalFooter: "Verify local planning rules, consents, taxes, insurance, and professional requirements before relying on any concept.",
    figures: CHANGEABLE_MARKET_FIGURES.nz,
  },
  ca: {
    market: "ca",
    label: "Canada",
    hostname: "ca.splanai.com",
    hrefLang: "en-ca",
    locale: "en-CA",
    currency: "CAD",
    areaUnit: "sqft", // Canada uses square feet in listings (same as US), despite metric officialdom.
    lotDataProvider: "manual",
    // termYears 25 = CA standard amortization (30yr exists for first-time/new-build only).
    // mortgageRatePct = FALLBACK only; live rate comes from Bank of Canada Valet API (series V80691335, 5yr conventional).
    financeDefaults: { downPct: 20, termYears: 25, mortgageRatePct: 6.0 }, // fallback only; live via BoC V80691335 (verified ~6.09% 2026-07).
    vocab: {
      stateLabel: "Province",
      lotSizeLabel: "Lot Size (sq ft)",
      budgetLabel: "Budget (CAD)",
      sqftLabel: "sq ft",
      cityPlaceholder: "e.g. Toronto",
      statePlaceholder: "e.g. ON",
      streetPlaceholder: "e.g. 1234 Maple Ave, Toronto, ON",
    },
    legalFooter: "Verify local zoning, permits, taxes, insurance, and professional requirements before relying on any concept.",
    figures: CHANGEABLE_MARKET_FIGURES.ca,
  },
};

const MARKET_SET = new Set<string>(MARKET_CODES);
const MARKET_COOKIE = "splanai_market";
const SQFT_PER_M2 = 10.76391041671;
const RATE_SOURCE_NAME: Record<Market, string> = {
  us: "FRED (Freddie Mac PMMS)",
  au: "Reserve Bank of Australia",
  nz: "Reserve Bank of New Zealand estimate",
  ca: "Bank of Canada",
};

export function isMarket(value: unknown): value is Market {
  return typeof value === "string" && MARKET_SET.has(value);
}

export function getMarketPack(market: unknown): MarketPack {
  return MARKET_PACKS[isMarket(market) ? market : "us"];
}

export function marketFromHost(host: string | null | undefined): Market | null {
  const hostname = (host ?? "").split(":")[0].trim().toLowerCase();
  if (!hostname) return null;
  if (hostname === "splanai.com" || hostname === "www.splanai.com") return "us";
  for (const market of MARKET_CODES) {
    if (hostname === MARKET_PACKS[market].hostname) return market;
  }
  const [subdomain] = hostname.split(".");
  return isMarket(subdomain) ? subdomain : null;
}

export function marketFromCountry(country: string | null | undefined): Market | null {
  switch ((country ?? "").trim().toUpperCase()) {
    case "US":
      return "us";
    case "AU":
      return "au";
    case "NZ":
      return "nz";
    case "CA":
      return "ca";
    default:
      return null;
  }
}

export function resolveMarketFromRequest(
  req: NextRequest,
  options: { sharedLinkMarket?: unknown; profileMarket?: unknown } = {},
): Market {
  return (
    marketFromHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host")) ??
    (isMarket(options.sharedLinkMarket) ? options.sharedLinkMarket : null) ??
    (isMarket(options.profileMarket) ? options.profileMarket : null) ??
    (isMarket(req.cookies.get(MARKET_COOKIE)?.value) ? req.cookies.get(MARKET_COOKIE)?.value as Market : null) ??
    marketFromCountry(req.headers.get("x-vercel-ip-country")) ??
    "us"
  );
}

export function resolveMarketFromHeaders(
  headers: Headers,
  options: { sharedLinkMarket?: unknown; profileMarket?: unknown; cookieMarket?: unknown } = {},
): Market {
  return (
    marketFromHost(headers.get("x-forwarded-host") ?? headers.get("host")) ??
    (isMarket(options.sharedLinkMarket) ? options.sharedLinkMarket : null) ??
    (isMarket(options.profileMarket) ? options.profileMarket : null) ??
    (isMarket(options.cookieMarket) ? options.cookieMarket : null) ??
    marketFromCountry(headers.get("x-vercel-ip-country")) ??
    "us"
  );
}

export function formatCurrency(value: number, market: Market = "us"): string {
  const pack = MARKET_PACKS[market];
  return new Intl.NumberFormat(pack.locale, {
    style: "currency",
    currency: pack.currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatArea(
  sqft: number,
  market: Market = "us",
  options: { suffix?: "sq ft" | "sqft" | "sf"; maximumFractionDigits?: number } = {},
): string {
  const pack = MARKET_PACKS[market];
  if (pack.areaUnit === "sqft") {
    const value = new Intl.NumberFormat(pack.locale, { maximumFractionDigits: 0 }).format(Math.round(sqft));
    return `${value} ${options.suffix ?? "sq ft"}`;
  }

  const value = sqft / SQFT_PER_M2;
  const formatted = new Intl.NumberFormat(pack.locale, {
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(value);
  return `${formatted} m2`;
}

export function areaInputToSqft(market: Market = "us", value: number): number {
  return MARKET_PACKS[market].areaUnit === "m2" ? value * SQFT_PER_M2 : value;
}

// Area figure in the market's unit, WITHOUT the unit suffix (for "label + value" stat rows).
// us/ca -> square feet (unchanged), au/nz -> square metres.
export function areaValue(sqft: number, market: Market = "us"): string {
  const pack = MARKET_PACKS[market];
  const n = pack.areaUnit === "m2" ? sqft / SQFT_PER_M2 : sqft;
  return new Intl.NumberFormat(pack.locale, { maximumFractionDigits: 0 }).format(Math.round(n));
}

// Unit label for the market ("sq ft" or "m2").
export function areaUnitLabel(market: Market = "us"): string {
  return MARKET_PACKS[market].vocab.sqftLabel;
}

export function indicativeRateAssumptionNote(
  market: Market,
  asOf: string | null | undefined,
  sourceName: string | null | undefined,
): string {
  const asOfText = asOf
    ? new Date(`${asOf}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "today";
  const sourceText = sourceName?.trim() || RATE_SOURCE_NAME[market];
  return `Based on an indicative rate as of ${asOfText} (${sourceText}). Estimate only — not a quote and not financial or credit advice. Verify with your lender or adviser.`;
}

export function marketOrigin(market: Market): string {
  return `https://${MARKET_PACKS[market].hostname}`;
}

export function buildMarketLanguageAlternates(pathname = "/"): Record<string, string> {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return {
    "en-us": `${marketOrigin("us")}${path}`,
    "en-au": `${marketOrigin("au")}${path}`,
    "en-nz": `${marketOrigin("nz")}${path}`,
    "en-ca": `${marketOrigin("ca")}${path}`,
    "x-default": `${marketOrigin("us")}${path}`,
  };
}
