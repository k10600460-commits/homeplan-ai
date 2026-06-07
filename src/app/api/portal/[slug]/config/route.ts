import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  // config: ConfigState object to save, or null to clear
  const { planId, config } = await req.json()

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
    .select('saved_configs')
    .eq('link_id', link.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedConfigs: Record<string, any> = { ...(state?.saved_configs as any ?? {}) }
  const key = String(planId)
  if (config === null) {
    delete savedConfigs[key]
  } else {
    savedConfigs[key] = config
  }

  await admin.from('portal_buyer_state').upsert(
    { link_id: link.id, saved_configs: savedConfigs, updated_at: new Date().toISOString() },
    { onConflict: 'link_id' },
  )

  return NextResponse.json({ ok: true })
}
