import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { computeConfigPrice, calcMonthly } from '@/lib/price-calculator'
import { getMortgageRate } from '@/lib/mortgage-rate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://splanai.com'
const RE_ENGAGEMENT_COOLDOWN_DAYS = 7

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Current FRED 30yr rate
  const { rate: currentRate } = await getMortgageRate()

  // All active portals
  const { data: links } = await admin
    .from('shared_links')
    .select('id, slug, user_id, client_name, builder_name, plans, financials')
    .eq('is_active', true)
    .not('plans', 'is', null)

  if (!links?.length) return NextResponse.json({ ok: true, drafted: 0 })

  // Builder company names
  const builderIds = [...new Set(links.map((l: { user_id: string }) => l.user_id).filter(Boolean))]
  const { data: builderProfiles } = await admin
    .from('team_profiles')
    .select('owner_user_id, company_name')
    .in('owner_user_id', builderIds)
  const profileMap = new Map(
    (builderProfiles ?? []).map((p: { owner_user_id: string; company_name: string | null }) => [p.owner_user_id, p.company_name]),
  )

  // Builder auth emails for Reply-To
  const builderEmailMap = new Map<string, string>()
  for (const id of builderIds) {
    try {
      const { data: { user } } = await admin.auth.admin.getUserById(id)
      if (user?.email) builderEmailMap.set(id, user.email)
    } catch { /* ignore */ }
  }

  // Buyer states
  const linkIds = links.map((l: { id: string }) => l.id)
  const { data: buyerStates } = await admin
    .from('portal_buyer_state')
    .select('link_id, buyer_email, saved_configs, favorites, last_visited_at, unsubscribed_at')
    .in('link_id', linkIds)
  const buyerStateMap = new Map(
    (buyerStates ?? []).map((bs: { link_id: string }) => [bs.link_id, bs]),
  )

  // Existing pending/sent drafts for dedup
  const { data: existingDrafts } = await admin
    .from('nurture_drafts')
    .select('link_id, trigger_type, trigger_context, status, created_at')
    .in('link_id', linkIds)
    .in('status', ['pending', 'sent'])
  const draftsByLink = new Map<string, typeof existingDrafts>()
  for (const d of existingDrafts ?? []) {
    const key = (d as { link_id: string }).link_id
    if (!draftsByLink.has(key)) draftsByLink.set(key, [])
    draftsByLink.get(key)!.push(d)
  }

  let drafted = 0
  const errors: string[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const link of links as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bs = buyerStateMap.get(link.id) as any
    if (bs?.unsubscribed_at) continue

    const recipientEmail = (bs?.buyer_email as string | null) ?? null
    const recipientName  = (link.client_name as string | null) ?? null
    const plans: unknown[]  = (link.plans as unknown[]) ?? []
    if (!plans.length) continue

    const financials = link.financials as { rate?: number; downPct?: number; termYears?: number } | null
    const sharedRate = financials?.rate ?? null
    const downPct    = financials?.downPct   ?? 20
    const termYears  = financials?.termYears ?? 30

    const builderName = (link.builder_name as string | null) ||
      profileMap.get(link.user_id) || 'Your Builder'
    const builderEmail = builderEmailMap.get(link.user_id) ?? null
    const portalUrl  = `${APP_URL}/s/${link.slug}`
    const unsubUrl   = `${APP_URL}/api/portal/${link.slug}/unsubscribe`

    const existing = draftsByLink.get(link.id) ?? []
    let draftCreated = false

    // ── 1. rate_drop ─────────────────────────────────────────────────────────
    if (sharedRate !== null && currentRate <= sharedRate - 0.25) {
      const rateBand = Math.floor(currentRate * 10) / 10
      const alreadyDrafted = (existing as { trigger_type: string; trigger_context: unknown }[]).some(d => {
        if (d.trigger_type !== 'rate_drop') return false
        return (d.trigger_context as { rateBand?: number })?.rateBand === rateBand
      })

      if (!alreadyDrafted) {
        // Determine price: saved_config > favorites > first plan
        const savedConfigs = (bs?.saved_configs ?? {}) as Record<string, { sqft?: number; beds?: number; baths?: number; style?: string }>
        const favorites    = (bs?.favorites ?? []) as string[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allPlans     = plans as any[]
        let price: number | null = null
        let planName = allPlans[0]?.name ?? 'your plan'

        if (Object.keys(savedConfigs).length > 0) {
          const key  = Object.keys(savedConfigs)[0]
          const cfg  = savedConfigs[key]
          const plan = allPlans.find(p => String(p.id) === key)
          if (plan && cfg) {
            price    = computeConfigPrice(plan, { sqft: cfg.sqft ?? plan.squareFootage, beds: cfg.beds ?? plan.bedrooms, baths: cfg.baths ?? plan.bathrooms, style: cfg.style ?? plan.style })
            planName = plan.name
          }
        }
        if (price === null && favorites.length > 0) {
          const fp = allPlans.find(p => String(p.id) === favorites[0])
          if (fp) { price = fp.estimatedCost; planName = fp.name }
        }
        if (price === null) { price = allPlans[0].estimatedCost as number; planName = allPlans[0].name as string }
        const resolvedPrice = price as number

        const newMonthly = calcMonthly(resolvedPrice, downPct, currentRate, termYears)
        const oldMonthly = calcMonthly(resolvedPrice, downPct, sharedRate,  termYears)
        const savings    = oldMonthly - newMonthly

        try {
          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 700,
            messages: [{
              role: 'user',
              content: `Write a warm follow-up email from "${builderName}" to "${recipientName ?? 'a buyer'}" about a mortgage rate drop on their home proposal.

Key details:
- Builder: ${builderName}
- Plan: ${planName}
- Rate: ${sharedRate.toFixed(2)}% → ${currentRate.toFixed(2)}%
- Monthly payment: ~$${oldMonthly.toLocaleString()} → ~$${newMonthly.toLocaleString()} (saves ~$${savings.toLocaleString()}/mo)
- Portal link: ${portalUrl}
- Unsubscribe link: ${unsubUrl}

Write a genuine, conversational message. 3-4 short paragraphs. Mention the monthly savings. End with the unsubscribe line. Sign as "${builderName}".

Format exactly:
SUBJECT: [subject line]
BODY:
[body text]`,
            }],
          })
          const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
          const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
          const bodyMatch    = text.match(/BODY:\s*([\s\S]+)/i)
          const subject = subjectMatch?.[1]?.trim() ?? `Good news — rates just dropped on your proposal`
          const body    = bodyMatch?.[1]?.trim() ?? text

          await admin.from('nurture_drafts').insert({
            builder_user_id: link.user_id,
            link_id: link.id,
            trigger_type: 'rate_drop',
            trigger_context: { oldRate: sharedRate, newRate: currentRate, rateBand, price: resolvedPrice, oldMonthly, newMonthly, savings, planName },
            recipient_email: recipientEmail,
            recipient_name:  recipientName,
            subject, body,
            status: 'pending',
          })
          drafted++
          draftCreated = true
        } catch (err) {
          errors.push(`rate_drop ${link.slug}: ${String(err)}`)
        }
      }
    }
    if (draftCreated) continue

    // ── 2. new_concept ────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const plan of plans as any[]) {
      if (!plan.addedAt) continue
      const planId = String(plan.id)
      const alreadyDrafted = (existing as { trigger_type: string; trigger_context: unknown }[]).some(d => {
        if (d.trigger_type !== 'new_concept') return false
        return (d.trigger_context as { planId?: string })?.planId === planId
      })
      if (alreadyDrafted) continue

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Write a warm email from "${builderName}" to "${recipientName ?? 'a buyer'}" announcing a new home design concept added to their custom home proposal.

New concept: "${plan.name}" — ${plan.style}, ${(plan.squareFootage as number)?.toLocaleString()} sqft, ${plan.bedrooms}bd/${plan.bathrooms}ba, ~$${Math.round((plan.estimatedCost as number) / 1000)}K
Portal link: ${portalUrl}
Unsubscribe link: ${unsubUrl}

2-3 short paragraphs. Enthusiastic but not pushy. Do not use the phrase "floor plan" — say "home concept" or "design" instead. End with the unsubscribe line. Sign as "${builderName}".

Format exactly:
SUBJECT: [subject line]
BODY:
[body text]`,
          }],
        })
        const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
        const bodyMatch    = text.match(/BODY:\s*([\s\S]+)/i)
        const subject = subjectMatch?.[1]?.trim() ?? `A new home concept was added to your proposal: ${plan.name}`
        const body    = bodyMatch?.[1]?.trim() ?? text

        await admin.from('nurture_drafts').insert({
          builder_user_id: link.user_id,
          link_id: link.id,
          trigger_type: 'new_concept',
          trigger_context: { planId, planName: plan.name, addedAt: plan.addedAt, estimatedCost: plan.estimatedCost },
          recipient_email: recipientEmail,
          recipient_name:  recipientName,
          subject, body,
          status: 'pending',
        })
        drafted++
        draftCreated = true
      } catch (err) {
        errors.push(`new_concept ${link.slug}/${planId}: ${String(err)}`)
      }
      if (draftCreated) break
    }
    if (draftCreated) continue

    // ── 3. re_engagement ──────────────────────────────────────────────────────
    const favorites    = (bs?.favorites as string[] | null) ?? []
    const savedConfigs = (bs?.saved_configs ?? {}) as Record<string, unknown>
    const isEngaged    = favorites.length > 0 || Object.keys(savedConfigs).length > 0

    if (isEngaged) {
      const cutoff      = new Date(Date.now() - RE_ENGAGEMENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const recentNurture = (existing as { created_at: string }[]).some(d => d.created_at > cutoff)

      if (!recentNurture) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allPlans = plans as any[]
        const engagedIds = [...new Set([...favorites, ...Object.keys(savedConfigs)])]
        const engagedPlan = allPlans.find(p => engagedIds.includes(String(p.id))) ?? allPlans[0]

        try {
          const msg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: `Write a friendly check-in email from "${builderName}" to "${recipientName ?? 'a buyer'}" who has been reviewing their home proposal.

Context:
- Buyer reviewed: "${engagedPlan.name}"
${favorites.length > 0 ? `- Buyer favorited this plan` : ''}
${Object.keys(savedConfigs).length > 0 ? `- Buyer customized their home design options` : ''}
- Portal: ${portalUrl}
- Unsubscribe: ${unsubUrl}

2-3 short paragraphs, conversational and helpful. Say "home concept" or "proposal" — not "floor plan". Offer to answer questions. End with unsubscribe line. Sign as "${builderName}".

Format exactly:
SUBJECT: [subject line]
BODY:
[body text]`,
            }],
          })
          const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
          const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
          const bodyMatch    = text.match(/BODY:\s*([\s\S]+)/i)
          const subject = subjectMatch?.[1]?.trim() ?? `Checking in on your home proposal`
          const body    = bodyMatch?.[1]?.trim() ?? text

          await admin.from('nurture_drafts').insert({
            builder_user_id: link.user_id,
            link_id: link.id,
            trigger_type: 're_engagement',
            trigger_context: { favorites, savedConfigKeys: Object.keys(savedConfigs), planName: engagedPlan.name, builderEmail },
            recipient_email: recipientEmail,
            recipient_name:  recipientName,
            subject, body,
            status: 'pending',
          })
          drafted++
        } catch (err) {
          errors.push(`re_engagement ${link.slug}: ${String(err)}`)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, drafted, currentRate, errors: errors.length ? errors : undefined })
}
