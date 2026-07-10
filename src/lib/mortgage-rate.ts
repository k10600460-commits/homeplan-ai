import { unstable_cache } from 'next/cache'
import { getMarketPack, type Market } from '@/lib/market'

export interface RateResult {
  rate: number
  asOf: string   // ISO date string of the observation, e.g. "2026-05-29"
  source: 'fred' | 'boc' | 'rba' | 'fallback'
  sourceName: string   // for "Powered by" attribution
  sourceUrl: string
  sourceLabel: string  // human description of the rate type (market-specific)
}

// Attribution ("Powered by") per official source.
const RATE_SOURCE = {
  fred: {
    sourceName: 'FRED (Freddie Mac PMMS)',
    sourceUrl: 'https://fred.stlouisfed.org/series/MORTGAGE30US',
    sourceLabel: '30-year fixed average',
  },
  boc: {
    sourceName: 'Bank of Canada',
    sourceUrl: 'https://www.bankofcanada.ca/rates/banking-and-financial-statistics/posted-interest-rates-offered-by-chartered-banks/',
    sourceLabel: '5-year fixed average (uninsured mortgages, funds advanced)',
  },
  rba: {
    sourceName: 'Reserve Bank of Australia',
    sourceUrl: 'https://www.rba.gov.au/statistics/tables/',
    sourceLabel: 'discounted variable rate (owner-occupier)',
  },
  rbnz: {
    sourceName: 'Reserve Bank of New Zealand',
    sourceUrl: 'https://www.rbnz.govt.nz/statistics',
    sourceLabel: '2-year fixed rate (indicative)',
  },
} as const

const INTENDED_SOURCE: Record<Market, keyof typeof RATE_SOURCE> = { us: 'fred', ca: 'boc', au: 'rba', nz: 'rbnz' }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Per-market fallback = MarketPack.financeDefaults.mortgageRatePct, attributed to the intended source.
function fallbackFor(market: Market): RateResult {
  const s = RATE_SOURCE[INTENDED_SOURCE[market]]
  return {
    rate: getMarketPack(market).financeDefaults.mortgageRatePct,
    asOf: todayISO(),
    source: 'fallback',
    sourceName: `${s.sourceName} (estimate)`,
    sourceUrl: s.sourceUrl,
    sourceLabel: `${s.sourceLabel} (estimate)`,
  }
}

// US: FRED 30-year fixed (MORTGAGE30US). Fetch behaviour unchanged from the original.
async function _fetchFredRate(): Promise<RateResult> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) return fallbackFor('us')
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=MORTGAGE30US&api_key=${apiKey}&sort_order=desc&limit=1&file_type=json`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`FRED ${res.status}`)
    const data = await res.json() as { observations: Array<{ date: string; value: string }> }
    const obs = data.observations?.[0]
    if (!obs || obs.value === '.') throw new Error('No FRED observation')
    const rate = parseFloat(obs.value)
    if (!isFinite(rate)) throw new Error('Invalid rate')
    return { rate, asOf: obs.date, source: 'fred', ...RATE_SOURCE.fred }
  } catch (err) {
    console.error('[mortgage-rate] FRED fetch failed, using fallback:', err)
    return fallbackFor('us')
  }
}

// Canada: Bank of Canada Valet API — series V122667786 (5-year fixed, UNINSURED, funds advanced;
// monthly, ~1-2mo observation lag). Swapped from posted V80691335 (6.09%) which overstated
// repayments ~21% vs actual borrowing rates (Fable5 pre-launch review R3, 2026-07-10). Free, no key.
async function _fetchBocRate(): Promise<RateResult> {
  try {
    const url = 'https://www.bankofcanada.ca/valet/observations/V122667786/json?recent=1'
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`BoC ${res.status}`)
    const data = await res.json() as { observations?: Array<{ d: string } & Record<string, { v: string }>> }
    const obs = data.observations?.[data.observations.length - 1]
    const rate = parseFloat(obs?.['V122667786']?.v ?? '')
    if (!obs || !isFinite(rate)) throw new Error('No BoC observation')
    return { rate, asOf: obs.d, source: 'boc', ...RATE_SOURCE.boc }
  } catch (err) {
    console.error('[mortgage-rate] BoC fetch failed, using fallback:', err)
    return fallbackFor('ca')
  }
}

// Australia: RBA F5 "Indicator Lending Rates" CSV, series FILRHLBVD
// (Housing loans, Banks, Variable, Discounted, Owner-occupier — reflects actual borrowing cost). No API — parse the CSV.
async function _fetchRbaRate(): Promise<RateResult> {
  try {
    const res = await fetch('https://www.rba.gov.au/statistics/tables/csv/f5-data.csv', { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`RBA ${res.status}`)
    const text = await res.text()
    const rows = text.split(/\r?\n/).map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
    // Locate the column whose "Series ID" row cell equals FILRHLBVD.
    let col = -1
    for (const row of rows) {
      const idx = row.findIndex((c) => c === 'FILRHLBVD')
      if (idx > 0) { col = idx; break }
    }
    if (col < 0) throw new Error('RBA series FILRHLBVD not found')
    // Walk from the bottom for the last row with a numeric value in that column.
    let rate = NaN
    let asOf = todayISO()
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = parseFloat(rows[i][col] ?? '')
      if (isFinite(v)) {
        rate = v
        const d = Date.parse(rows[i][0] ?? '')
        if (!Number.isNaN(d)) asOf = new Date(d).toISOString().slice(0, 10)
        break
      }
    }
    if (!isFinite(rate)) throw new Error('No RBA observation')
    return { rate, asOf, source: 'rba', ...RATE_SOURCE.rba }
  } catch (err) {
    console.error('[mortgage-rate] RBA fetch failed, using fallback:', err)
    return fallbackFor('au')
  }
}

// New Zealand: no compliant free live feed exists yet. RBNZ B20 (official) is WAF-blocked
// (403) and XLSX-only; interest.co.nz and Squirrel publish rates but their terms of use
// forbid public redistribution. Until a licensed/permitted feed is in place, NZ uses a
// clearly-labeled indicative estimate (MarketPack.financeDefaults.mortgageRatePct), shown
// with an "(estimate)" attribution. Follow-up: license a feed or obtain written permission,
// then add an _fetchNzRate() here and route it below.

// Market-aware live rate. us -> FRED (JSON), ca -> BoC Valet (JSON), au -> RBA F5 (CSV), nz -> labeled estimate.
async function _fetchRate(market: Market): Promise<RateResult> {
  if (market === 'ca') return _fetchBocRate()
  if (market === 'au') return _fetchRbaRate()
  if (market === 'nz') return fallbackFor('nz')
  return _fetchFredRate()
}

// Cache for 24 hours via Next.js Data Cache. The `market` argument is part of the cache key.
const _cachedFetchRate = unstable_cache(
  _fetchRate,
  ['mortgage-rate-by-market-v5'],
  { revalidate: 86400 },
)

// Defaults to 'us' so every existing caller (getMortgageRate()) is unchanged.
export function getMortgageRate(market: Market = 'us'): Promise<RateResult> {
  return _cachedFetchRate(market)
}
