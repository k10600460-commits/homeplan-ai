// Shared neighborhood-data helpers used by /api/neighborhood and /s/[slug] portal page.
// Single source of truth for geocoding + Places nearby search so both paths behave identically.

export interface PlaceResult {
  name: string
  rating?: number
  vicinity?: string
  geometry?: { location: { lat: number; lng: number } }
}

interface GoogleGeocodeResponse {
  results: {
    geometry: { location: { lat: number; lng: number } }
    address_components: { long_name: string; types: string[] }[]
  }[]
  status: string
}

interface GoogleNearbyResponse {
  results: PlaceResult[]
  status: string
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1))
}

export async function geocodeCity(
  city: string,
  state: string,
): Promise<{ lat: number; lng: number; zipCode: string | null; usedReverseGeocode: boolean } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const query = encodeURIComponent(`${city}, ${state}, USA`)
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`,
    { cache: 'no-store' },
  )
  const data = await res.json() as GoogleGeocodeResponse

  if (data.status !== 'OK' || !data.results[0]) {
    console.warn(`[neighborhood] geocode ${city}, ${state} → ${data.status}`)
    return null
  }

  const { lat, lng } = data.results[0].geometry.location
  let zipCode = data.results[0].address_components.find(c => c.types.includes('postal_code'))?.long_name ?? null
  let usedReverseGeocode = false

  if (!zipCode) {
    try {
      const revRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=postal_code&key=${key}`,
        { cache: 'no-store' },
      )
      const revData = await revRes.json() as GoogleGeocodeResponse
      if (revData.status === 'OK' && revData.results[0]) {
        zipCode = revData.results[0].address_components.find(c => c.types.includes('postal_code'))?.long_name ?? null
        usedReverseGeocode = true
      }
    } catch { /* proceed without zip code */ }
  }

  return { lat, lng, zipCode, usedReverseGeocode }
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  type: string,
  radius = 5000,
): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return []

  const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radius), type, key })
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`,
    { cache: 'no-store' },
  )
  const data = await res.json() as GoogleNearbyResponse

  if (data.status !== 'OK') {
    console.warn(`[neighborhood] nearbysearch type=${type} → ${data.status} @ (${lat},${lng})`)
    return []
  }
  return data.results.slice(0, 3)
}

// Baseline = 5 (Moderate). Google Places doesn't reliably index every police/fire station,
// so missing results are treated as neutral rather than "unsafe".
export function computeSafetyScore(policeCount: number, fireCount: number): number {
  return Math.min(10, 5 + Math.min(policeCount, 3) + Math.min(fireCount, 2))
}
