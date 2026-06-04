import { NextResponse } from 'next/server'
import { getMortgageRate } from '@/lib/mortgage-rate'

export const revalidate = 86400 // 24h

export async function GET() {
  const result = await getMortgageRate()
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
