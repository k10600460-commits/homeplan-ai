import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkExternalUsage, recordExternalUsage } from '@/lib/external-apis'

// Exact messages per spec
const GMAPS_UNAVAILABLE  = { available: false, reason: 'Data unavailable at this time' }
const RENTCAST_LIMIT     = { available: false, reason: 'Market data limit reached' }

interface PlaceResult {
  name: string
  rating?: number
  vicinity?: string
  types?: string[]
  geometry?: {
    location: { lat: number; lng: number }
  }
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
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1))
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

async function getNearbyPlaces(
  lat: number,
  lng: number,
  type: string,
  radius = 5000,
): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), type, key })
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
  const res = await fetch(url)
  const data = await res.json() as GoogleNearbyResponse
  if (data.status !== 'OK') return []
  return data.results.slice(0, 3)
}

function computeSafetyScore(policeCount: number, fireCount: number): number {
  const raw = 3 + policeCount * 2 + fireCount * 1
  return Math.min(10, raw)
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const city  = searchParams.get('city')?.trim()
    const state = searchParams.get('state')?.trim()

    if (!city || !state) {
      return NextResponse.json({ error: 'city and state are required' }, { status: 400 })
    }
    if (!/^[a-zA-Z\s\-'.]{1,60}$/.test(city) || !/^[a-zA-Z\s]{1,30}$/.test(state)) {
      return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    }

    const result: {
      neighborhood: Record<string, unknown>
      market: Record<string, unknown>
    } = {
      neighborhood: GMAPS_UNAVAILABLE,
      market:       RENTCAST_LIMIT,
    }

    // ── Google Maps ──────────────────────────────────────────────────
    const mapsCheck = await checkExternalUsage('google_maps')
    if (mapsCheck.allowed && process.env.GOOGLE_MAPS_API_KEY) {
      const coords = await geocode(city, state)
      await recordExternalUsage('google_maps') // 1 req: geocoding

      if (coords) {
        const [schools, hospitals, groceries, policeStations, fireStations] = await Promise.all([
          getNearbyPlaces(coords.lat, coords.lng, 'school'),
          getNearbyPlaces(coords.lat, coords.lng, 'hospital'),
          getNearbyPlaces(coords.lat, coords.lng, 'grocery_or_supermarket'),
          getNearbyPlaces(coords.lat, coords.lng, 'police'),
          getNearbyPlaces(coords.lat, coords.lng, 'fire_station'),
        ])
        // 5 Nearby Search calls
        await Promise.all(Array.from({ length: 5 }, () => recordExternalUsage('google_maps')))

        const mapPlace = (p: PlaceResult) => ({
          name:       p.name,
          rating:     p.rating ?? null,
          vicinity:   p.vicinity ?? null,
          distanceKm: p.geometry
            ? haversineKm(coords.lat, coords.lng, p.geometry.location.lat, p.geometry.location.lng)
            : null,
        })

        const safetyScore = computeSafetyScore(policeStations.length, fireStations.length)

        result.neighborhood = {
          available:       true,
          nearingLimit:    mapsCheck.nearingLimit,
          city,
          state,
          coordinates:     coords,
          schools:         schools.map(mapPlace),
          hospitals:       hospitals.map(mapPlace),
          groceries:       groceries.map(mapPlace),
          safety: {
            score:          safetyScore,
            policeStations: policeStations.length,
            fireStations:   fireStations.length,
            label:          safetyScore >= 8 ? 'High' : safetyScore >= 5 ? 'Moderate' : 'Low',
          },
        }
      } else {
        result.neighborhood = GMAPS_UNAVAILABLE
      }
    } else if (!mapsCheck.allowed) {
      result.neighborhood = GMAPS_UNAVAILABLE
    }

    // ── RentCast ────────────────────────────────────────────────────
    const rentCheck = await checkExternalUsage('rentcast')
    if (rentCheck.allowed && process.env.RENTCAST_API_KEY) {
      const params = new URLSearchParams({ city, state, dataType: 'All', historyRange: '1' })
      const res = await fetch(
        `https://api.rentcast.io/v1/markets?${params}`,
        { headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY, Accept: 'application/json' } },
      )
      await recordExternalUsage('rentcast')

      if (res.ok) {
        const data = await res.json() as RentCastMarket
        result.market = {
          available:        true,
          nearingLimit:     rentCheck.nearingLimit,
          city,
          state,
          averageRent:      data.averageRent      ?? null,
          medianRent:       data.medianRent        ?? null,
          averageSalePrice: data.averageSalePrice  ?? null,
          medianSalePrice:  data.medianSalePrice   ?? null,
        }
      } else {
        result.market = RENTCAST_LIMIT
      }
    } else if (!rentCheck.allowed) {
      result.market = RENTCAST_LIMIT
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    console.error('[neighborhood] error:', err)
    return NextResponse.json({
      neighborhood: GMAPS_UNAVAILABLE,
      market:       RENTCAST_LIMIT,
    })
  }
}
