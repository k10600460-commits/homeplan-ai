import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export interface IntentSignal {
  link_id: string
  slug: string
  label: string
  city: string | null
  state: string | null
  views: number
  plan_selects: number
  pdf_downloads: number
  selected_concepts: string[]
  first_seen: string | null
  last_seen: string | null
  events_7d: number
  heat: 'HOT' | 'WARM' | 'COLD'
  next_action: string
}

interface BuyerEnrichment {
  favorites: string[]
  savedConfigs: Record<string, unknown>
  lastVisitedAt: string | null
}

function classifyHeat(
  s: Pick<IntentSignal, 'plan_selects' | 'pdf_downloads' | 'events_7d'>,
  buyer?: BuyerEnrichment,
): IntentSignal['heat'] {
  if (
    s.plan_selects >= 1 || s.pdf_downloads >= 1 || s.events_7d >= 3 ||
    (buyer?.favorites.length ?? 0) >= 1
  ) return 'HOT'
  if (s.events_7d >= 1 || Object.keys(buyer?.savedConfigs ?? {}).length > 0) return 'WARM'
  return 'COLD'
}

function computeNextAction(
  s: Pick<IntentSignal, 'plan_selects' | 'pdf_downloads' | 'views' | 'events_7d' | 'selected_concepts'>,
  buyer?: BuyerEnrichment,
  plans?: Array<{ id?: unknown; name?: string }> | null,
): string {
  if (s.plan_selects >= 1) {
    const c = s.selected_concepts.filter(Boolean).join(', ') || 'a concept'
    return `Buyer selected ${c}. Call today.`
  }
  if ((buyer?.favorites.length ?? 0) >= 1) {
    const favNames = (buyer?.favorites ?? []).map(pid => {
      return plans?.find(p => String(p.id) === pid)?.name ?? null
    }).filter(Boolean).join(', ') || 'a concept'
    return `Buyer favorited ${favNames}. Follow up.`
  }
  if (s.pdf_downloads >= 1) return 'Buyer downloaded the proposal. Follow up.'
  if (Object.keys(buyer?.savedConfigs ?? {}).length > 0) {
    const cfg = Object.values(buyer!.savedConfigs)[0] as Record<string, unknown>
    return `Buyer configured ${cfg?.beds ?? '?'}bd / ${cfg?.sqft?.toLocaleString?.() ?? '?'} sqft / ${cfg?.style ?? '?'}. Reach out.`
  }
  if (s.views >= 3) return `Buyer reopened ${s.views}×. Reach out.`
  if (s.events_7d >= 1) return 'Recent activity — keep warm.'
  return 'No recent activity.'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: links, error: linksErr } = await supabase
    .from('shared_links')
    .select('id, slug, client_name, builder_name, city, state, plans')
    .eq('user_id', user.id)

  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 })
  if (!links?.length) return NextResponse.json({ signals: [] })

  const linkIds = links.map(l => l.id as string)
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events, error: eventsErr } = await supabase
    .from('link_events')
    .select('link_id, event_type, plan_index, created_at')
    .in('link_id', linkIds)

  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 })

  // Fetch buyer state for all links (builder's own RLS applies)
  const { data: buyerStates } = await supabase
    .from('portal_buyer_state')
    .select('link_id, favorites, saved_configs, last_visited_at')
    .in('link_id', linkIds)

  const buyerStateMap = new Map<string, BuyerEnrichment>(
    (buyerStates ?? []).map(b => [
      b.link_id as string,
      {
        favorites: (b.favorites as string[] | null) ?? [],
        savedConfigs: (b.saved_configs as Record<string, unknown> | null) ?? {},
        lastVisitedAt: (b.last_visited_at as string | null) ?? null,
      },
    ]),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkMap = new Map<string, any>(links.map(l => [l.id as string, l]))

  type Agg = {
    views: number; plan_selects: number; pdf_downloads: number
    selected_concepts: Set<string>; first_seen: string | null; last_seen: string | null
    events_7d: number
  }
  const agg = new Map<string, Agg>()

  for (const e of events ?? []) {
    const lid = e.link_id as string
    if (!agg.has(lid)) {
      agg.set(lid, { views: 0, plan_selects: 0, pdf_downloads: 0, selected_concepts: new Set(), first_seen: null, last_seen: null, events_7d: 0 })
    }
    const a = agg.get(lid)!
    const etype = e.event_type as string
    const ts = e.created_at as string

    if (etype === 'view') a.views++
    if (etype === 'plan_selected') {
      a.plan_selects++
      const pi = e.plan_index as number | null
      if (pi != null) {
        const link = linkMap.get(lid)
        const plans = link?.plans as Array<{ name?: string }> | null
        const name = plans?.[pi]?.name
        if (name) a.selected_concepts.add(name)
      }
    }
    if (etype === 'pdf_download') a.pdf_downloads++
    if (!a.first_seen || ts < a.first_seen) a.first_seen = ts
    if (!a.last_seen || ts > a.last_seen) a.last_seen = ts
    if (ts >= cutoff7d) a.events_7d++
  }

  // Also surface links that have buyer state (favorites/config) but no events yet
  for (const [link_id, buyer] of buyerStateMap) {
    if (agg.has(link_id)) continue // already covered by events loop
    if (buyer.favorites.length === 0 && Object.keys(buyer.savedConfigs).length === 0) continue
    agg.set(link_id, {
      views: 0, plan_selects: 0, pdf_downloads: 0,
      selected_concepts: new Set(), first_seen: null,
      last_seen: buyer.lastVisitedAt, events_7d: 0,
    })
  }

  const signals: IntentSignal[] = []
  for (const [link_id, a] of agg) {
    const link = linkMap.get(link_id)
    if (!link) continue
    const selected_concepts = Array.from(a.selected_concepts)
    const buyer = buyerStateMap.get(link_id)

    // Merge last_visited_at from buyer state into last_seen recency
    const bsLastSeen = buyer?.lastVisitedAt ?? null
    const effectiveLastSeen = [a.last_seen, bsLastSeen].filter(Boolean).sort().pop() ?? a.last_seen

    const partial = {
      link_id,
      slug: link.slug as string,
      label: (link.client_name as string | null)?.trim() || (link.builder_name as string | null)?.trim() || (link.slug as string),
      city: (link.city as string | null) ?? null,
      state: (link.state as string | null) ?? null,
      views: a.views,
      plan_selects: a.plan_selects,
      pdf_downloads: a.pdf_downloads,
      selected_concepts,
      first_seen: a.first_seen,
      last_seen: effectiveLastSeen,
      events_7d: a.events_7d,
    }
    const heat = classifyHeat(partial, buyer)
    const plans = link.plans as Array<{ id?: unknown; name?: string }> | null
    const next_action = computeNextAction(partial, buyer, plans)
    signals.push({ ...partial, heat, next_action })
  }

  const heatOrder: Record<IntentSignal['heat'], number> = { HOT: 0, WARM: 1, COLD: 2 }
  signals.sort((a, b) =>
    heatOrder[a.heat] - heatOrder[b.heat] ||
    (b.last_seen ?? '').localeCompare(a.last_seen ?? ''),
  )

  return NextResponse.json({ signals })
}
