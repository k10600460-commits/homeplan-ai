import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://splanai.com'

function buildHtmlBody(body: string, unsubUrl: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 12px">${line}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#111827;font-size:15px;line-height:1.6">
${escaped}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
<p style="font-size:12px;color:#9ca3af">You're receiving this because you subscribed to updates on your home proposal.
<a href="${unsubUrl}" style="color:#9ca3af">Unsubscribe</a>.</p>
</body></html>`
}

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

  // Fetch draft + link in one query
  const { data: draft } = await admin
    .from('nurture_drafts')
    .select('id, link_id, status, recipient_email, recipient_name, subject, body')
    .eq('id', id)
    .eq('builder_user_id', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status !== 'pending') {
    return NextResponse.json({ error: 'Draft is not pending' }, { status: 400 })
  }
  if (!draft.recipient_email) {
    return NextResponse.json({ error: 'No recipient email on this draft' }, { status: 400 })
  }

  // Suppression check
  const { data: buyerState } = await admin
    .from('portal_buyer_state')
    .select('unsubscribed_at')
    .eq('link_id', draft.link_id)
    .single()

  if (buyerState?.unsubscribed_at) {
    await admin.from('nurture_drafts').update({
      status: 'failed',
      error: 'unsubscribed',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ error: 'Recipient has unsubscribed' }, { status: 400 })
  }

  // Get link for builder_name + slug
  const { data: link } = await admin
    .from('shared_links')
    .select('slug, builder_name, user_id')
    .eq('id', draft.link_id)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  // Builder name
  let builderName = (link.builder_name as string | null) ?? ''
  if (!builderName) {
    const { data: profile } = await admin
      .from('team_profiles')
      .select('company_name')
      .eq('owner_user_id', link.user_id)
      .single()
    builderName = (profile?.company_name as string | null) ?? 'Your Builder'
  }

  // Builder reply-to email
  let replyTo: string | undefined
  try {
    const { data: { user: builderUser } } = await admin.auth.admin.getUserById(link.user_id)
    if (builderUser?.email) replyTo = builderUser.email
  } catch { /* ignore */ }

  const unsubUrl = `${APP_URL}/api/portal/${link.slug}/unsubscribe`
  const htmlBody = buildHtmlBody(draft.body as string, unsubUrl)

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  const sendResult = await resend.emails.send({
    from: `${builderName} via SplanAI <notify@splanai.com>`,
    ...(replyTo ? { replyTo } : {}),
    to: draft.recipient_email as string,
    subject: draft.subject as string,
    html: htmlBody,
    text: draft.body as string,
  })

  if (sendResult.error) {
    await admin.from('nurture_drafts').update({
      status: 'failed',
      error: sendResult.error.message,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ error: sendResult.error.message }, { status: 500 })
  }

  await admin.from('nurture_drafts').update({
    status: 'sent',
    resend_id: sendResult.data?.id ?? null,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}
