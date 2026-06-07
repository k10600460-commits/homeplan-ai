import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: link } = await admin
    .from('shared_links')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!link) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Found</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center">
  <p style="color:#6b7280;">Link not found.</p>
</body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  await admin.from('portal_buyer_state').upsert(
    {
      link_id: link.id,
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'link_id' },
  )

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center;color:#111827">
  <div style="width:56px;height:56px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
    <svg width="28" height="28" fill="none" stroke="#059669" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
  </div>
  <h1 style="font-size:22px;font-weight:700;margin-bottom:12px">You're unsubscribed.</h1>
  <p style="color:#6b7280;font-size:15px;line-height:1.5">You will no longer receive follow-up emails from this builder about this proposal.</p>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}
