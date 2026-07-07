import { NextResponse } from 'next/server'
import { getMortgageRate } from '@/lib/mortgage-rate'
import { marketFromHost } from '@/lib/market'

export const revalidate = 86400 // 24h

export async function GET(req: Request) {
  // Resolve market from the request host: ca.splanai.com -> ca (Bank of Canada),
  // splanai.com -> us (FRED, unchanged). Defaults to 'us'.
  const market = marketFromHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host')) ?? 'us'
  const result = await getMortgageRate(market)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
