import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import SharePortalClient from './SharePortalClient'
import { checkExternalUsage, recordExternalUsage } from '@/lib/external-apis'
import { geocodeCity, getNearbyPlaces, haversineKm, computeSafetyScore, PlaceResult } from '@/lib/neighborhood'
import { resolveMarketFromHeaders, type Market } from '@/lib/market'

export const dynamic = 'force-dynamic'

// Toggle: 'live' = refresh area data per 24h TTL | 'snapshot' = use share-time fixed data only
const PORTAL_AREA_MODE: 'live' | 'snapshot' = 'live'
const AREA_TTL_MS = 24 * 60 * 60 * 1000

async function fetchAreaData(city: string, state: string): Promise<{
  neighborhood: Record<string, unknown>
  market: Record<string, unknown>
}> {
  const GMAPS_UNAVAILABLE = { available: false, reason: 'Data unavailable at this time' }
  const RENTCAST_LIMIT    = { available: false, reason: 'Market data limit reached' }
  let neighborhood: Record<string, unknown> = GMAPS_UNAVAILABLE
  let market: Record<string, unknown>       = RENTCAST_LIMIT

  const mapsCheck = await checkExternalUsage('google_maps')
  let zipCode: string | null = null

  if (mapsCheck.allowed && process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const coords = await geocodeCity(city, state)
      await recordExternalUsage('google_maps')
      if (coords?.usedReverseGeocode) await recordExternalUsage('google_maps')

      if (coords) {
        zipCode = coords.zipCode
        const { lat, lng } = coords
        const [schools, hospitals, groceries, policeStations, fireStations] = await Promise.all([
          getNearbyPlaces(lat, lng, 'school'),
          getNearbyPlaces(lat, lng, 'hospital'),
          getNearbyPlaces(lat, lng, 'grocery_or_supermarket'),
          getNearbyPlaces(lat, lng, 'police'),
          getNearbyPlaces(lat, lng, 'fire_station'),
        ])
        await Promise.all(Array.from({ length: 5 }, () => recordExternalUsage('google_maps')))

        const mapPlace = (p: PlaceResult) => ({
          name: p.name, rating: p.rating ?? null, vicinity: p.vicinity ?? null,
          distanceKm: p.geometry ? haversineKm(lat, lng, p.geometry.location.lat, p.geometry.location.lng) : null,
        })
        const safetyScore = computeSafetyScore(policeStations.length, fireStations.length)
        neighborhood = {
          available: true, nearingLimit: mapsCheck.nearingLimit, city, state,
          schools:   schools.map(mapPlace),
          hospitals: hospitals.map(mapPlace),
          groceries: groceries.map(mapPlace),
          safety: {
            score: safetyScore,
            policeStations: policeStations.length,
            fireStations:   fireStations.length,
            label: safetyScore >= 8 ? 'High' : safetyScore >= 5 ? 'Moderate' : 'Low',
          },
        }
      }
    } catch { /* fall through to GMAPS_UNAVAILABLE */ }
  }

  const rentKey  = process.env.RENTCAST_API_KEY
  const rentCheck = await checkExternalUsage('rentcast')
  if (rentCheck.allowed && rentKey && zipCode) {
    try {
      const params  = new URLSearchParams({ city, state, zipCode, dataType: 'All', historyRange: '1' })
      const rentRes = await fetch(`https://api.rentcast.io/v1/markets?${params}`, {
        headers: { 'X-Api-Key': rentKey, Accept: 'application/json' },
      })
      await recordExternalUsage('rentcast')
      if (rentRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = await rentRes.json() as any
        market = {
          available: true, nearingLimit: rentCheck.nearingLimit, city, state,
          averageRent: d.rentalData?.averageRent ?? null, medianRent: d.rentalData?.medianRent ?? null,
          averageSalePrice: d.saleData?.averagePrice ?? null, medianSalePrice: d.saleData?.medianPrice ?? null,
        }
      }
    } catch { /* fall through to RENTCAST_LIMIT */ }
  }

  return { neighborhood, market }
}

interface Props {
  params: Promise<{ slug: string }>
}

export interface PortalBranding {
  plan: 'free' | 'pro' | 'team';
  companyName: string;
  logoDataUrl: string | null;
  phone: string;
  website: string;
  licenseNumber: string;
  tagline: string;
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const SELECT = 'id, slug, plans, client_name, is_active, expires_at, view_count, user_id, city, state, financials, neighborhood_snapshot, market_snapshot, area_refreshed_at, builder_name, builder_logo_url, plans_updated_at, market'
  const SELECT_LEGACY = 'id, slug, plans, client_name, is_active, expires_at, view_count, user_id, city, state, financials, neighborhood_snapshot, market_snapshot, area_refreshed_at, builder_name, builder_logo_url, plans_updated_at'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let link: any = null
  let linkErr: { message?: string } | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let res = await admin.from('shared_links').select(SELECT).eq('slug', slug).maybeSingle()
    if (res.error && /market/i.test(res.error.message ?? '')) {
      res = await admin.from('shared_links').select(SELECT_LEGACY).eq('slug', slug).maybeSingle()
    }
    link = res.data
    linkErr = res.error ?? null
    if (!linkErr) break
    if (attempt === 0) await new Promise(r => setTimeout(r, 150))
  }

  // Transient/infra error — do NOT show "inactive"; surface retryable error boundary instead.
  if (linkErr) {
    throw new Error(`Portal fetch failed for "${slug}": ${linkErr.message ?? 'unknown error'}`)
  }
  // Genuinely missing slug or deactivated link.
  if (!link || !link.is_active) {
    return <InvalidLinkPage />
  }

  // expires_at check: null means never expires (living portal)
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <InvalidLinkPage expired />
  }

  // ── Buyer state: visit recording + favorites + saved configs ──────────
  let favorites: string[] = []
  let savedConfigs: Record<string, unknown> = {}
  let previousVisitedAt: string | null = null
  try {
    const { data: bs } = await admin
      .from('portal_buyer_state')
      .select('favorites, saved_configs, last_visited_at, visit_count')
      .eq('link_id', link.id)
      .maybeSingle()

    previousVisitedAt = (bs?.last_visited_at as string | null) ?? null
    favorites = (bs?.favorites as string[] | null) ?? []
    savedConfigs = (bs?.saved_configs as Record<string, unknown> | null) ?? {}

    await admin.from('portal_buyer_state').upsert(
      {
        link_id: link.id,
        previous_visited_at: previousVisitedAt,
        last_visited_at: new Date().toISOString(),
        visit_count: ((bs?.visit_count as number | null) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'link_id' },
    )
  } catch { /* non-fatal — never break the page render */ }

  // ── Server-side 'view' event (UA-filtered; skips bots/crawlers/link-previewers) ──
  const BOT_UA = /bot|crawler|spider|preview|slurp|googlebot|bingbot|slackbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|discordbot|telegrambot|headlesschrome|ms-office|msoffice/i
  try {
    const hdrs = await headers()
    const ua = hdrs.get('user-agent') ?? ''
    if (!BOT_UA.test(ua)) {
      const rawIp = hdrs.get('x-forwarded-for')?.split(',')[0].trim()
        || hdrs.get('x-real-ip')
        || 'unknown'
      const ipHash = createHash('sha256')
        .update(rawIp + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(0, 16))
        .digest('hex')
      const { error } = await admin.rpc('record_link_view', {
        p_link_id:    link.id,
        p_event_type: 'view',
        p_plan_index: null,
        p_referrer:   (hdrs.get('referer') ?? '').slice(0, 512) || null,
        p_user_agent: ua.slice(0, 512) || null,
        p_ip_hash:    ipHash,
      })
      if (error) console.error('[share/view]', error)
    }
  } catch (err) {
    console.error('[share/view]', err)
  }

  // ── Area data (neighborhood + market) with 24h TTL cache per portal ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let neighborhood: Record<string, unknown> | null = (link.neighborhood_snapshot as any) ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let market: Record<string, unknown> | null       = (link.market_snapshot as any) ?? null
  let areaAsOf: string | null = link.area_refreshed_at ?? null

  if (PORTAL_AREA_MODE === 'live' && link.city && link.state) {
    const lastRefresh = link.area_refreshed_at ? new Date(link.area_refreshed_at).getTime() : 0
    // eslint-disable-next-line react-hooks/purity -- server-side TTL check, not client render state.
    const needsRefresh = (Date.now() - lastRefresh) > AREA_TTL_MS

    if (needsRefresh) {
      try {
        const result = await fetchAreaData(link.city, link.state)
        neighborhood = result.neighborhood
        market       = result.market
        areaAsOf     = new Date().toISOString()
        // Persist updated snapshots (fire-and-forget is fine; failure falls back to old cache)
        await admin.from('shared_links').update({
          neighborhood_snapshot: neighborhood,
          market_snapshot:       market,
          area_refreshed_at:     areaAsOf,
        }).eq('id', link.id)
      } catch { /* Use cached data if refresh fails */ }
    }
  }

  // Fetch builder's prequal + book-a-meeting CTA settings from profiles
  let prequalUrl: string | null = null
  let prequalLabel: string | null = null
  let appointmentUrl: string | null = null
  let profileMarket: string | null = null
  if (link.user_id) {
    try {
      let profileResult = await admin
        .from('profiles')
        .select('prequal_url, prequal_label, appointment_url, market')
        .eq('id', link.user_id)
        .single()
      if (profileResult.error && /market/i.test(profileResult.error.message ?? '')) {
        profileResult = await admin
          .from('profiles')
          .select('prequal_url, prequal_label, appointment_url')
          .eq('id', link.user_id)
          .single()
      }
      const prof = profileResult.data
      prequalUrl     = (prof?.prequal_url     as string | null)?.trim() || null
      prequalLabel   = (prof?.prequal_label   as string | null)?.trim() || null
      appointmentUrl = (prof?.appointment_url as string | null)?.trim() || null
      profileMarket  = (prof?.market          as string | null)?.trim() || null
    } catch { /* non-fatal */ }
  }

  const hdrs = await headers()
  const marketCode: Market = resolveMarketFromHeaders(hdrs, {
    sharedLinkMarket: link.market,
    profileMarket,
  })

  // Fetch builder's branding if they have a paid plan
  let branding = await fetchBranding(admin, link.user_id)

  // Per-portal override: builder_name / builder_logo_url set directly on shared_links
  // (admin/demo use). Takes priority over account-level team_profiles branding.
  // When present, forces isBranded=true even on free accounts.
  const portalBuilderName = (link.builder_name as string | null)?.trim() || null
  const portalLogoUrl     = (link.builder_logo_url as string | null)?.trim() || null
  if (portalBuilderName || portalLogoUrl) {
    branding = {
      ...branding,
      ...(portalBuilderName ? { companyName: portalBuilderName } : {}),
      ...(portalLogoUrl     ? { logoDataUrl: portalLogoUrl }     : {}),
      plan: branding.plan === 'free' ? 'pro' : branding.plan,
    }
  }

  return (
    <SharePortalClient
      slug={slug}
      plans={link.plans}
      clientName={link.client_name ?? null}
      expiresAt={link.expires_at ?? null}
      branding={branding}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      financials={(link.financials as any) ?? null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      neighborhood={neighborhood as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      market={market as any}
      areaAsOf={areaAsOf}
      favorites={favorites}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      savedConfigs={savedConfigs as any}
      previousVisitedAt={previousVisitedAt}
      plansUpdatedAt={(link.plans_updated_at as string | null) ?? null}
      prequalUrl={prequalUrl}
      prequalLabel={prequalLabel}
      appointmentUrl={appointmentUrl}
      marketCode={marketCode}
    />
  )
}

async function fetchBranding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string | null,
): Promise<PortalBranding> {
  const defaultBranding: PortalBranding = { plan: 'free', companyName: '', logoDataUrl: null, phone: '', website: '', licenseNumber: '', tagline: '' };
  if (!userId) return defaultBranding;

  const [subResult, profileResult] = await Promise.all([
    admin.from('subscriptions').select('plan, status').eq('user_id', userId).maybeSingle(),
    admin.from('team_profiles').select('company_name, logo_url, phone, website, license_number, tagline').eq('owner_user_id', userId).maybeSingle(),
  ]);

  const sub = subResult.data;
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return defaultBranding;

  const plan: 'free' | 'pro' | 'team' = sub.plan === 'team' ? 'team' : sub.plan === 'pro' ? 'pro' : 'free';
  if (plan === 'free') return defaultBranding;

  const companyName: string = profileResult.data?.company_name ?? '';
  const logoUrl: string | null = profileResult.data?.logo_url ?? null;

  let logoDataUrl: string | null = null;
  if (logoUrl) {
    try {
      const { data: signed } = await admin.storage.from('branding').createSignedUrl(logoUrl, 3600);
      if (signed?.signedUrl) {
        const res = await fetch(signed.signedUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const mime = res.headers.get('content-type') ?? 'image/png';
          logoDataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
        }
      }
    } catch { /* branding optional — continue without logo */ }
  }

  return {
    plan,
    companyName,
    logoDataUrl,
    phone: profileResult.data?.phone ?? '',
    website: profileResult.data?.website ?? '',
    licenseNumber: profileResult.data?.license_number ?? '',
    tagline: profileResult.data?.tagline ?? '',
  };
}

function InvalidLinkPage({ expired }: { expired?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          This link is no longer active.
        </h1>
        <p className="text-gray-500 mb-4">
          {expired ? 'This proposal has expired. Please contact your builder for an updated proposal.' : 'Please contact your builder for an updated proposal.'}
        </p>
      </div>
    </div>
  )
}
