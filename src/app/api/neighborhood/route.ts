import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkExternalUsage, recordExternalUsage } from '@/lib/external-apis'

const UNAVAILABLE = { available: false, reason: 'Data currently unavailable' }

interface PlaceResult {
  name: string
  rating?: number
  vicinity?: string
  types?: string[]
}

interface GoogleNearbyResponse {
  results: PlaceResult[]
  status: string
}

interface RentCastMarket {
  averageRent?: number
  medianRent?: number
  averageSalePrice?: number
  medianSalePrice?: number
  rentToSaleRatio?: number
}

async function geocode(city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const query = encodeURIComponent(`${city}, ${state}, USA`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`
  const res = await fetch(url)
  const data = await res.json() as { results: { geometry: { location: { lat: number; lng: number } } }[]; status: string }
  if (data.status !== 'OK' || !data.results[0]) return null
  return data.results[0].geometry.location
}

async function getNearbyPlaces(lat: number, lng: number, type: string, keyword?: string): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius:   '5000',
    type,
    key,
    ...(keyword ? { keyword } : {}),
  })
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
  const res = await fetch(url)
  const data = await res.json() as GoogleNearbyResponse
  if (data.status !== 'OK') return []
  return data.results.slice(0, 3)
}

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const city  = searchParams.get('city')?.trim()
    const state = searchParams.get('state')?.trim()

    if (!city || !state) {
      return NextResponse.json({ error: 'city and state are required' }, { status: 400 })
    }

    // Sanitize inputs
    if (!/^[a-zA-Z\s\-'.]{1,60}$/.test(city) || !/^[a-zA-Z\s]{1,30}$/.test(state)) {
      return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    }

    const result: {
      neighborhood: Record<string, unknown> | null
      market: Record<string, unknown> | null
    } = { neighborhood: null, market: null }

    // ── Google Maps ───────────────────────────────────────────────────
    const mapsAllowed = await checkExternalUsage('google_maps')
    if (mapsAllowed.allowed) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY
      if (apiKey) {
        // Each property-level call uses 2 Geocoding + 3 Nearby = 5 requests max
        const coords = await geocode(city, state)
        await recordExternalUsage('google_maps') // geocode = 1 req

        if (coords) {
          const [schools, hospitals, groceries] = await Promise.all([
            getNearbyPlaces(coords.lat, coords.lng, 'school'),
            getNearbyPlaces(coords.lat, coords.lng, 'hospital'),
            getNearbyPlaces(coords.lat, coords.lng, 'grocery_or_supermarket'),
          ])
          // 3 Nearby Search calls
          await Promise.all([
            recordExternalUsage('google_maps'),
            recordExternalUsage('google_maps'),
            recordExternalUsage('google_maps'),
          ])

          result.neighborhood = {
            available: true,
            city,
            state,
            coordinates: coords,
            schools:    schools.map(p => ({ name: p.name, rating: p.rating ?? null, vicinity: p.vicinity ?? null })),
            hospitals:  hospitals.map(p => ({ name: p.name, vicinity: p.vicinity ?? null })),
            groceries:  groceries.map(p => ({ name: p.name, vicinity: p.vicinity ?? null })),
          }
        } else {
          result.neighborhood = UNAVAILABLE
        }
      } else {
        result.neighborhood = UNAVAILABLE
      }
    } else {
      result.neighborhood = { available: false, reason: 'Monthly data limit reached' }
    }

    // ── RentCast ──────────────────────────────────────────────────────
    const rentAllowed = await checkExternalUsage('rentcast')
    if (rentAllowed.allowed) {
      const rentcastKey = process.env.RENTCAST_API_KEY
      if (rentcastKey) {
        const params = new URLSearchParams({ city, state, dataType: 'All', historyRange: '1' })
        const res = await fetch(
          `https://api.rentcast.io/v1/markets?${params}`,
          { headers: { 'X-Api-Key': rentcastKey, Accept: 'application/json' } }
        )
        await recordExternalUsage('rentcast')

        if (res.ok) {
          const data = await res.json() as RentCastMarket
          result.market = {
            available:        true,
            city,
            state,
            averageRent:      data.averageRent      ?? null,
            medianRent:       data.medianRent        ?? null,
            averageSalePrice: data.averageSalePrice  ?? null,
            medianSalePrice:  data.medianSalePrice   ?? null,
          }
        } else {
          result.market = UNAVAILABLE
        }
      } else {
        result.market = UNAVAILABLE
      }
    } else {
      result.market = { available: false, reason: 'Monthly data limit reached' }
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    console.error('[neighborhood] error:', err)
    return NextResponse.json({ neighborhood: UNAVAILABLE, market: UNAVAILABLE })
  }
}
