import { unstable_cache } from 'next/cache'

const FALLBACK_RATE = 6.5

interface RateResult {
  rate: number
  asOf: string   // ISO date string of the observation, e.g. "2026-05-29"
  source: 'fred' | 'fallback'
}

async function _fetchFredRate(): Promise<RateResult> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) {
    return { rate: FALLBACK_RATE, asOf: new Date().toISOString().slice(0, 10), source: 'fallback' }
  }

  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=MORTGAGE30US&api_key=${apiKey}&sort_order=desc&limit=1&file_type=json`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`FRED ${res.status}`)
    const data = await res.json() as {
      observations: Array<{ date: string; value: string }>
    }
    const obs = data.observations?.[0]
    if (!obs || obs.value === '.') throw new Error('No FRED observation')
    const rate = parseFloat(obs.value)
    if (!isFinite(rate)) throw new Error('Invalid rate')
    return { rate, asOf: obs.date, source: 'fred' }
  } catch (err) {
    console.error('[mortgage-rate] FRED fetch failed, using fallback:', err)
    return { rate: FALLBACK_RATE, asOf: new Date().toISOString().slice(0, 10), source: 'fallback' }
  }
}

// Cache for 24 hours via Next.js Data Cache
export const getMortgageRate = unstable_cache(
  _fetchFredRate,
  ['mortgage-rate-30yr-fixed'],
  { revalidate: 86400 },
)
