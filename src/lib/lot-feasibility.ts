/**
 * Static lot-feasibility hints for /tools/lot-feasibility.
 *
 * Rules of engagement (do not relax):
 * - General rules of thumb ONLY. Never emit jurisdiction-specific regulation
 *   numbers (setback feet, coverage %, minimum lot sizes) — zoning varies by
 *   city/county, so every output repeats "verify locally".
 * - Pure + synchronous: runs entirely in the browser, zero server calls,
 *   deliberately unlimited (unlike /try, which is one sample per visitor).
 * - The $/sqft ballpark brackets the same scale the in-app estimates use
 *   (MARGINAL_PER_SQFT = $200/sqft in price-calculator.ts).
 */

export const BUDGET_BANDS = [
  { id: "under-250k", label: "Under $250k", min: 150_000, max: 250_000 },
  { id: "250k-400k", label: "$250k – $400k", min: 250_000, max: 400_000 },
  { id: "400k-600k", label: "$400k – $600k", min: 400_000, max: 600_000 },
  { id: "600k-plus", label: "$600k+", min: 600_000, max: 900_000 },
] as const;

export type BudgetBandId = (typeof BUDGET_BANDS)[number]["id"];

// Rough national all-in build cost range used only to bracket a sqft ballpark.
// Presented to users as a rule of thumb, never as a quote.
export const COST_PER_SQFT_LOW = 150;
export const COST_PER_SQFT_HIGH = 250;

export const MIN_LOT_SQFT = 500;
export const MAX_LOT_SQFT = 1_000_000;

const SQFT_PER_ACRE = 43_560;

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

export interface FeasibilityInput {
  lotSqft: number;
  budgetBandId: BudgetBandId;
  /** Optional 2-letter state code; anything unrecognized falls back to generic copy. */
  state?: string;
}

export interface FeasibilityHints {
  /** e.g. "8,500 sq ft (~0.20 acres)" */
  lotLabel: string;
  lotNote: string;
  /** Ballpark buildable house size for the chosen budget band. */
  buildRange: { minSqft: number; maxSqft: number };
  budgetNote: string;
  /** How the ballpark house size relates to the raw lot area (geometry only, not zoning). */
  fitNote: string;
  stateNote: string;
  /** Universal "verify locally" items — same list for every input, on purpose. */
  checklist: string[];
  disclaimer: string;
}

export function normalizeState(state?: string): string | null {
  const code = (state ?? "").trim().toUpperCase();
  return US_STATE_CODES.has(code) ? code : null;
}

function clampLot(sqft: number): number {
  if (!Number.isFinite(sqft)) return MIN_LOT_SQFT;
  return Math.min(MAX_LOT_SQFT, Math.max(MIN_LOT_SQFT, Math.round(sqft)));
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function lotNoteFor(sqft: number): string {
  if (sqft < 2_000) {
    return "That's very small even by urban infill standards. Before anything else, confirm it's actually a buildable lot of record — parcels this size are sometimes leftover slivers that may not qualify.";
  }
  if (sqft < 5_000) {
    return "Compact infill territory. On lots like this the buildable envelope is usually decided by setbacks and lot-coverage rules, not by the raw square footage — the local zoning sheet matters more than the number.";
  }
  if (sqft < 10_000) {
    return "This is the classic suburban single-family range. Most production and custom plans are drawn with lots like this in mind, so plan selection tends to be the easy part.";
  }
  if (sqft < SQFT_PER_ACRE / 2) {
    return "A roomy suburban lot — quarter-acre-plus. Usually enough breathing room for a garage, a real yard, and some flexibility in how the house sits on the lot.";
  }
  if (sqft <= SQFT_PER_ACRE) {
    return "Half an acre to a full acre. At this size, whether the lot is on municipal sewer and water (or needs well and septic) often shapes the budget more than the house plan does.";
  }
  return "Acreage. The house is rarely the constraint out here — driveway runs, utility extensions, grading, and well/septic are the line items that surprise people.";
}

function fitNoteFor(lotSqft: number, maxHouseSqft: number): string {
  const ratio = maxHouseSqft / lotSqft;
  if (ratio >= 1) {
    return "A single-story plan at the top of that size range would be bigger than the lot itself — so this is multi-story (or smaller footprint) territory by simple geometry, before zoning even enters the picture.";
  }
  if (ratio >= 0.4) {
    return "A single-story plan at the top of that range would take up a large share of the lot once you carve out setbacks, driveway, and yard. A two-story plan usually breathes easier here. The actual limit comes from local zoning, not this math.";
  }
  return "The raw footprint math is comfortable — a house in that range leaves plenty of lot. The practical limits will come from zoning (setbacks, coverage, height), not from lot area.";
}

function stateNoteFor(state?: string): string {
  const code = normalizeState(state);
  const where = code ? `In ${code}, like everywhere in the US,` : "Everywhere in the US,";
  return `${where} zoning is set city by city and county by county — the same lot can be straightforward in one jurisdiction and a much harder conversation in the next. Nothing here replaces a call to the local planning department.`;
}

const VERIFY_CHECKLIST = [
  "Zoning and setbacks — confirm the zoning designation and what it allows with the city or county planning department.",
  "Utilities — municipal water/sewer at the lot line, or well and septic? Hookup and extension costs vary wildly.",
  "Soil and grading — a soils/geotech report beats guessing, especially on slopes or former fill.",
  "HOA and deed restrictions — private covenants can be stricter than zoning and don't show up on the zoning map.",
  "Permits and impact fees — timelines and fees are local; ask before you promise a start date.",
];

export function getFeasibilityHints(input: FeasibilityInput): FeasibilityHints {
  const lotSqft = clampLot(input.lotSqft);
  const band =
    BUDGET_BANDS.find((b) => b.id === input.budgetBandId) ?? BUDGET_BANDS[1];

  const minSqft = roundTo(band.min / COST_PER_SQFT_HIGH, 50);
  const maxSqft = roundTo(band.max / COST_PER_SQFT_LOW, 50);

  const acres = lotSqft / SQFT_PER_ACRE;
  const lotLabel = `${lotSqft.toLocaleString("en-US")} sq ft (~${acres.toFixed(2)} acres)`;

  return {
    lotLabel,
    lotNote: lotNoteFor(lotSqft),
    buildRange: { minSqft, maxSqft },
    budgetNote:
      `At a rough $${COST_PER_SQFT_LOW}–$${COST_PER_SQFT_HIGH} per finished square foot — a national rule of thumb, not a quote — ` +
      `the ${band.label} band supports roughly ${minSqft.toLocaleString("en-US")}–${maxSqft.toLocaleString("en-US")} sq ft of house. ` +
      "Your local costs can swing this a lot in either direction.",
    fitNote: fitNoteFor(lotSqft, maxSqft),
    stateNote: stateNoteFor(input.state),
    checklist: [...VERIFY_CHECKLIST],
    disclaimer:
      "General rules of thumb only — no local regulations were consulted. Zoning varies by city and county; verify locally before promising anything.",
  };
}
