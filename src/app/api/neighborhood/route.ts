import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkExternalUsage, recordExternalUsage } from '@/lib/external-apis'
import { checkRateLimitDB } from '@/lib/rate-limit-db'

// 30 neighborhood lookups per authenticated user per minute
const NEIGHBORHOOD_RATE = { limit: 30, windowSec: 60 }

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

interface GoogleGeocodeResponse {
  results: {
    geometry: { location: { lat: number; lng: number } }
    address_components: { long_name: string; types: string[] }[]
  }[]
  status: string
}

interface RentCastMarket {
  rentalData?: { averageRent?: number; medianRent?: number }
  saleData?: { averagePrice?: number; medianPrice?: number }
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

async function geocode(city: string, state: string): Promise<{ lat: number; lng: number; zipCode: string | null; usedReverseGeocode: boolean } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY!
  const query = encodeURIComponent(`${city}, ${state}, USA`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`
  const res = await fetch(url)
  const data = await res.json() as GoogleGeocodeResponse
  if (data.status !== 'OK' || !data.results[0]) return null
  const r = data.results[0]
  const { lat, lng } = r.geometry.location

  let zipCode = r.address_components.find(c => c.types.includes('postal_code'))?.long_name ?? null
  let usedReverseGeocode = false

  // City-level geocodes rarely contain a postal_code component.
  // Fall back to reverse-geocoding the center coordinates to get one.
  if (!zipCode) {
    try {
      const revUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=postal_code&key=${key}`
      const revRes = await fetch(revUrl)
      const revData = await revRes.json() as GoogleGeocodeResponse
      if (revData.status === 'OK' && revData.results[0]) {
        zipCode = revData.results[0].address_components.find(c => c.types.includes('postal_code'))?.long_name ?? null
        usedReverseGeocode = true
      }
    } catch {
      // Proceed without zip code if reverse geocode fails
    }
  }

  return { lat, lng, zipCode, usedReverseGeocode }
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
  // Baseline = 5 (Moderate). Google Places doesn't reliably index police/fire stations,
  // so we treat missing results as neutral rather than "unsafe".
  // Each found station is an additive signal toward "High".
  const raw = 5 + Math.min(policeCount, 3) + Math.min(fireCount, 2)
  return Math.min(10, raw)
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Shared DB rate limit (30 req/min per user)
    const rl = await checkRateLimitDB(`neighborhood:user:${user.id}`, NEIGHBORHOOD_RATE)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

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

    let geocodeResult: { lat: number; lng: number; zipCode: string | null; usedReverseGeocode: boolean } | null = null

    // ── Google Maps ──────────────────────────────────────────────────
    const mapsCheck = await checkExternalUsage('google_maps')
    if (mapsCheck.allowed && process.env.GOOGLE_MAPS_API_KEY) {
      geocodeResult = await geocode(city, state)
      // Count forward geocode (always 1). Count reverse geocode if it was used.
      await recordExternalUsage('google_maps')
      if (geocodeResult?.usedReverseGeocode) await recordExternalUsage('google_maps')

      if (geocodeResult) {
        const coords = { lat: geocodeResult.lat, lng: geocodeResult.lng }
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
    const zipCode = geocodeResult?.zipCode
    if (rentCheck.allowed && process.env.RENTCAST_API_KEY && zipCode) {
      const params = new URLSearchParams({ city, state, zipCode, dataType: 'All', historyRange: '1' })
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
          averageRent:      data.rentalData?.averageRent   ?? null,
          medianRent:       data.rentalData?.medianRent    ?? null,
          averageSalePrice: data.saleData?.averagePrice    ?? null,
          medianSalePrice:  data.saleData?.medianPrice     ?? null,
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
