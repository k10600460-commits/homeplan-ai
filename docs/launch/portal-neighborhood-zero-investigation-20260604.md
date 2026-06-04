# Portal Neighborhood Data — Zero-Result Investigation
**Date:** 2026-06-04  
**Branch:** feature/data-freshness-and-portal-data-20260604  
**Test portal:** `/s/qatp0604` (city=Tampa, state=FL)

---

## Symptom

After Phase 2 deploy, the share portal showed neighborhood data section but all categories were empty:
- `schools: []`, `hospitals: []`, `groceries: []`
- `safety.policeStations: 0`, `safety.fireStations: 0`, `safety.score: 5 (Moderate — default)`
- `available: true`, `nearingLimit: false`
- Market (RentCast) snapshot: **working correctly**
- DB row for `shared_links.neighborhood_snapshot` was written and `area_refreshed_at` set — so the cache pipeline itself worked

No errors in Vercel runtime logs (errors were silently swallowed by catch block).

---

## Investigation Steps

### 1. Code path review (`s/[slug]/page.tsx`)

`fetchAreaData(city, state)` was a **duplicate inline implementation** separate from the working `/api/neighborhood/route.ts`. Key differences found:

| | `fetchAreaData` (broken) | `getNearbyPlaces` in route (working) |
|---|---|---|
| status check | `results ?? []` — no status check | `if (data.status !== 'OK') return []` |
| fetch cache | no `cache: 'no-store'` | N/A (route handler, no cache) |
| API endpoint | legacy `nearbysearch/json` | legacy `nearbysearch/json` |

### 2. Env var check (Vercel)

`GOOGLE_MAPS_API_KEY` is set for both `production` AND `preview` environments. Env var scope was not the cause.

### 3. Quota check (Supabase `api_usage_external`)

Google Maps: 42 requests / 28,000 limit (June 2026) — not a quota issue.

### 4. First fix: shared lib + status logging (commit `58ceef9`)

Created `src/lib/neighborhood.ts` with the exact same implementation as the working route handler. Both callers now use shared `geocodeCity` + `getNearbyPlaces`. Added `console.warn` for non-OK status.

**Result:** Vercel logs showed:
```
[neighborhood] nearbysearch type=school → REQUEST_DENIED @ (27.95,-82.46)
```
(and same for all 5 types)

### 5. Root cause confirmed

`GOOGLE_MAPS_API_KEY` has **"Places API (New)"** enabled but NOT the legacy **"Places API"** (which handles the `place/nearbysearch/json` endpoint). Geocoding uses the Geocoding API (separately enabled — working). The legacy nearbysearch was hitting an API that was not activated for this key.

Why geocoding worked but nearbysearch didn't: they are billed as separate APIs in Google Cloud Console.

### 6. Final fix: Places API (New) POST format (commit `8585f77`)

Updated `getNearbyPlaces` in shared lib to try the new endpoint first:
```
POST https://places.googleapis.com/v1/places:searchNearby
Headers: X-Goog-Api-Key, X-Goog-FieldMask
Body:  { includedTypes: [type], maxResultCount: 3, locationRestriction: { circle: { ... } } }
```
Falls back to legacy if new API also fails. Type mapping: `grocery_or_supermarket` → `supermarket`.

---

## Verification (post-fix)

After deploy + re-fetch of `/s/qatp0604` (01:35:41 UTC):

```json
{
  "schools":    [{"name":"Blake High School","distanceKm":1.1}, ...],
  "hospitals":  [{"name":"Tampa General Hospital","rating":3,"distanceKm":1.5}, ...],
  "groceries":  [{"name":"Trader Joe's","rating":4.6,"distanceKm":4.9}, ...],
  "safety":     {"score":10,"label":"High","policeStations":3,"fireStations":3},
  "available":  true
}
```

All acceptance criteria met. ✅

---

## Action items for production

1. **No code changes needed** — the `Places API (New)` format is now the primary path with legacy fallback.
2. **Optional cleanup:** In Google Cloud Console, explicitly enable "Places API" (legacy) as a belt-and-suspenders measure, or remove the legacy fallback code if not needed.
3. **Main merge** as usual via PR when ready.
