export const STYLE_PREMIUM: Record<string, number> = {
  Contemporary: 12000, ModernFarmhouse: 8000,
  Transitional: 4000,  Craftsman: 4000,
  Colonial: 0,         Ranch: 0,
}
export const MARGINAL_PER_SQFT = 200
export const BATH_PER_BATH     = 15000
export const BEDROOM_COST      = 10000

export function getStylePremium(style: string): number {
  return STYLE_PREMIUM[style.replace(/\s+/g, '')] ?? 0
}

export interface PlanBase {
  estimatedCost: number
  squareFootage: number
  bedrooms: number
  bathrooms: number
  style: string
}

export interface ConfigState {
  sqft: number
  beds: number
  baths: number
  style: string
}

export function computeConfigPrice(plan: PlanBase, cfg: ConfigState): number {
  const raw = plan.estimatedCost
    + (cfg.sqft  - plan.squareFootage) * MARGINAL_PER_SQFT
    + (cfg.baths - plan.bathrooms)     * BATH_PER_BATH
    + (cfg.beds  - plan.bedrooms)      * BEDROOM_COST
    + (getStylePremium(cfg.style) - getStylePremium(plan.style))
  return Math.max(150000, Math.round(raw / 500) * 500)
}

export function calcMonthly(
  homePrice: number,
  downPct: number,
  ratePct: number,
  termYears: number,
): number {
  const principal = homePrice * (1 - downPct / 100)
  const r = ratePct / 100 / 12
  const n = termYears * 12
  if (r === 0) return Math.round(principal / n)
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
}
