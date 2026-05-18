import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_EVENTS = ['view', 'pdf_download', 'plan_selected'] as const
type EventType = (typeof ALLOWED_EVENTS)[number]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug      = String(body?.slug ?? '').trim()
    const eventType = body?.eventType as EventType
    const planIndex = body?.planIndex != null ? Number(body.planIndex) : null

    if (!slug || !ALLOWED_EVENTS.includes(eventType)) {
      return NextResponse.json({ ok: false, reason: 'invalid_params' }, { status: 400 })
    }

    // Hash IP with a server-side pepper (GDPR: raw IP never stored)
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
    const ipHash = createHash('sha256')
      .update(rawIp + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(0, 16))
      .digest('hex')

    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 512)
    const referrer  = (req.headers.get('referer') ?? '').slice(0, 512)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Resolve slug → link_id (validate active + not expired)
    const { data: link } = await admin
      .from('shared_links')
      .select('id, is_active, expires_at')
      .eq('slug', slug)
      .single()

    if (!link || !link.is_active) return NextResponse.json({ ok: false, reason: 'inactive' })
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, reason: 'expired' })
    }

    await admin.rpc('record_link_view', {
      p_link_id:    link.id,
      p_event_type: eventType,
      p_plan_index: planIndex,
      p_referrer:   referrer || null,
      p_user_agent: userAgent || null,
      p_ip_hash:    ipHash,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[share/event]', err)
    return NextResponse.json({ ok: false })
  }
}
