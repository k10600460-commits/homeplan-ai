import { unstable_cache } from "next/cache";

// Commute / drive-time via Google Routes API (computeRoutes), traffic-aware (real-time).
// Mirrors the mortgage-rate freshness discipline: live fetch, `asOf` timestamp, explicit
// `source`, graceful fallback when the key/route is unavailable. Reuses GOOGLE_MAPS_API_KEY
// (the "Routes API" must be enabled on that key in Google Cloud).

export interface CommuteResult {
  durationMin: number | null; // typical drive time in minutes (traffic-aware)
  distanceMi: number | null;
  asOf: string;               // ISO timestamp the live traffic estimate was computed
  source: "google" | "fallback";
}

async function _fetchCommute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<CommuteResult> {
  const nowIso = new Date().toISOString();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { durationMin: null, distanceMi: null, asOf: nowIso, source: "fallback" };
  }

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the request on the cheapest SKU that still returns duration+distance.
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat,   longitude: destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE", // live + historical traffic (real-time freshness)
      }),
    });
    if (!res.ok) throw new Error(`Routes ${res.status}`);

    const data = (await res.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
    const route = data.routes?.[0];
    if (!route?.duration) throw new Error("No route returned");

    const seconds = parseInt(String(route.duration).replace("s", ""), 10);
    const durationMin = Number.isFinite(seconds) ? Math.round(seconds / 60) : null;
    const distanceMi =
      typeof route.distanceMeters === "number"
        ? Math.round((route.distanceMeters / 1609.34) * 10) / 10
        : null;

    return { durationMin, distanceMi, asOf: nowIso, source: "google" };
  } catch (err) {
    console.error("[commute] Routes fetch failed, using fallback:", err);
    return { durationMin: null, distanceMi: null, asOf: nowIso, source: "fallback" };
  }
}

// Cache 1h per origin/destination pair: traffic-aware yet inexpensive and stable enough
// for a "typical commute" display. `asOf` reflects when the cached estimate was computed.
export function getCommute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<CommuteResult> {
  return unstable_cache(
    () => _fetchCommute(originLat, originLng, destLat, destLng),
    [
      "commute",
      originLat.toFixed(4), originLng.toFixed(4),
      destLat.toFixed(4),   destLng.toFixed(4),
    ],
    { revalidate: 3600 },
  )();
}
