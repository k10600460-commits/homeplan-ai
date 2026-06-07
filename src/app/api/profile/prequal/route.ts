import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawUrl   = typeof body?.url   === 'string' ? body.url.trim()   : ''
  const rawLabel = typeof body?.label === 'string' ? body.label.trim() : ''

  // Allow clearing (empty string) or a valid https:// URL
  if (rawUrl !== '' && !rawUrl.startsWith('https://')) {
    return NextResponse.json(
      { error: 'URL must start with https://' },
      { status: 400 },
    )
  }

  if (rawUrl.length > 2048) {
    return NextResponse.json({ error: 'URL too long' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('profiles')
    .update({
      prequal_url:   rawUrl   || null,
      prequal_label: rawLabel || null,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await admin
    .from('profiles')
    .select('prequal_url, prequal_label')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    prequalUrl:   (data?.prequal_url   as string | null) ?? null,
    prequalLabel: (data?.prequal_label as string | null) ?? null,
  })
}
