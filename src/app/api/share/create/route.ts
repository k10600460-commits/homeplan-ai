import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { checkRateLimitDB } from '@/lib/rate-limit-db'

// 20 shared links per authenticated user per hour
const SHARE_RATE = { limit: 20, windowSec: 3600 }

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(8)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Shared DB rate limit (20 links/hour per user)
  const rl = await checkRateLimitDB(`share:user:${user.id}`, SHARE_RATE)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const body = await req.json()
  const plans = body?.plans
  const generationId = body?.generationId ?? null

  if (!Array.isArray(plans) || plans.length === 0) {
    return NextResponse.json({ error: 'plans array required' }, { status: 400 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Generate unique slug (retry up to 5 times on collision)
  let slug = ''
  for (let i = 0; i < 5; i++) {
    const candidate = generateSlug()
    const { data: existing } = await admin
      .from('shared_links')
      .select('id')
      .eq('slug', candidate)
      .single()
    if (!existing) { slug = candidate; break }
  }
  if (!slug) return NextResponse.json({ error: 'Failed to generate unique slug' }, { status: 500 })

  const { data, error } = await admin
    .from('shared_links')
    .insert({ user_id: user.id, generation_id: generationId, slug, plans })
    .select('id, slug')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://homeplan-ai.vercel.app').replace(/\/$/, '')
  return NextResponse.json({ slug: data.slug, url: `${appUrl}/s/${data.slug}` })
}
