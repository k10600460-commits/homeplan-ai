import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Auth: only the builder who owns the link may append concepts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json()
  if (!plan || typeof plan !== 'object') {
    return NextResponse.json({ error: 'Missing plan' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id, plans, user_id')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single()

  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existingPlans = (link.plans as unknown[]) ?? []
  // Assign a new numeric ID (max existing + 1) and stamp addedAt
  const maxId = existingPlans.reduce((m: number, p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pid = Number((p as any).id ?? 0)
    return pid > m ? pid : m
  }, 0)
  const newPlan = { ...plan, id: maxId + 1, addedAt: new Date().toISOString() }

  const now = new Date().toISOString()
  await admin.from('shared_links').update({
    plans: [...existingPlans, newPlan],
    plans_updated_at: now,
  }).eq('id', link.id)

  return NextResponse.json({ plan: newPlan })
}
