import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { email } = await req.json()

  if (
    !email ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

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

  await admin.from('portal_buyer_state').upsert(
    {
      link_id: link.id,
      buyer_email: email.trim().toLowerCase(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'link_id' },
  )

  return NextResponse.json({ ok: true })
}
