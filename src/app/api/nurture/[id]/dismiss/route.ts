import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: draft } = await admin
    .from('nurture_drafts')
    .select('id, status')
    .eq('id', id)
    .eq('builder_user_id', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status !== 'pending') {
    return NextResponse.json({ error: 'Draft is not pending' }, { status: 400 })
  }

  await admin
    .from('nurture_drafts')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
