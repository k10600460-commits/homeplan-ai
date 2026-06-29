import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkExternalUsage, recordExternalUsage } from '@/lib/external-apis'
import { checkRateLimitDB } from '@/lib/rate-limit-db'
import { geocodeCity, geocodeAddress, getNearbyPlaces, haversineKm, computeSafetyScore, PlaceResult } from '@/lib/neighborhood'
import { getCommute } from '@/lib/commute'

// 30 neighborhood lookups per authenticated user per minute
const NEIGHBORHOOD_RATE = { limit: 30, windowSec: 60 }

// Exact messages per spec
const GMAPS_UNAVAILABLE  = { available: false, reason: 'Data unavailable at this time' }
const RENTCAST_LIMIT     = { available: false, reason: 'Market data limit reached' }

interface RentCastMarket {
  rentalData?: { averageRent?: number; medianRent?: number }
  saleData?: { averagePrice?: number; medianPrice?: number }
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

    // Optional street for lot-level commute (sanitized; ignored if it fails the charset check)
    const streetRaw = searchParams.get('street')?.trim()
    const street = streetRaw && /^[a-zA-Z0-9\s\-'.#,]{1,80}$/.test(streetRaw) ? streetRaw : undefined

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
      geocodeResult = await geocodeCity(city, state)
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

        // Commute (lot → city center), traffic-aware with as-of freshness — only when a street is supplied
        if (street) {
          const lot = await geocodeAddress(`${street}, ${city}, ${state}, USA`)
          await recordExternalUsage('google_maps')
          if (lot) {
            const commute = await getCommute(lot.lat, lot.lng, coords.lat, coords.lng)
            await recordExternalUsage('google_maps')
            if (commute.source === 'google' && commute.durationMin != null) {
              ;(result.neighborhood as Record<string, unknown>).commute = {
                durationMin:      commute.durationMin,
                distanceMi:       commute.distanceMi,
                destinationLabel: `${city} center`,
                asOf:             commute.asOf,
                source:           commute.source,
              }
            }
          }
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
