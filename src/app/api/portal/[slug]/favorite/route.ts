import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { planId, on } = await req.json()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id, is_active')
    .eq('slug', slug)
    .single()

  if (!link?.is_active) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: state } = await admin
    .from('portal_buyer_state')
    .select('favorites')
    .eq('link_id', link.id)
    .maybeSingle()

  let favorites: string[] = (state?.favorites as string[] | null) ?? []
  const pid = String(planId)
  if (on) {
    if (!favorites.includes(pid)) favorites = [...favorites, pid]
  } else {
    favorites = favorites.filter(f => f !== pid)
  }

  await admin.from('portal_buyer_state').upsert(
    { link_id: link.id, favorites, updated_at: new Date().toISOString() },
    { onConflict: 'link_id' },
  )

  return NextResponse.json({ ok: true })
}
