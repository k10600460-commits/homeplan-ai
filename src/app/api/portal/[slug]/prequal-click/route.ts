import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getClientIp } from '@/lib/security'
import { checkRateLimitDB } from '@/lib/rate-limit-db'

// 10 clicks/min per IP — generous for real users, blocks scripted replay
const CLICK_RATE = { limit: 10, windowSec: 60 }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const ip = getClientIp(req)
  const rl = await checkRateLimitDB(`prequal_click:ip:${ip}`, CLICK_RATE)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = await req.json().catch(() => ({}))
  const planIndex = body?.planIndex != null ? Number(body.planIndex) : null

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id, is_active, expires_at')
    .eq('slug', slug)
    .single()

  if (!link?.is_active) return NextResponse.json({ ok: false, reason: 'inactive' })
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, reason: 'expired' })
  }

  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  const ipHash = createHash('sha256')
    .update(rawIp + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(0, 16))
    .digest('hex')

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 512)
  const referrer  = (req.headers.get('referer') ?? '').slice(0, 512)

  await admin.from('link_events').insert({
    link_id:    link.id,
    event_type: 'prequal_click',
    plan_index: Number.isFinite(planIndex) ? planIndex : null,
    referrer:   referrer || null,
    user_agent: userAgent || null,
    ip_hash:    ipHash,
  })

  return NextResponse.json({ ok: true })
}
