import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALERT_EMAIL = 'k10600460@gmail.com'

const LIMITS = {
  google_maps: { warn: 25_000, stop: 28_000 },
  rentcast:    { warn: 45,     stop: 50     },
} as const

type Service = keyof typeof LIMITS

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function sendLimitAlert(service: Service, count: number, type: 'warning' | 'stopped') {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const resend = new Resend(resendKey)
  const subject = type === 'warning'
    ? `[SplanAI] ${service} usage warning: ${count} requests`
    : `[SplanAI] ${service} AUTO-STOPPED at ${count} requests`

  await resend.emails.send({
    from: 'SplanAI <noreply@splanai.com>',
    to: ALERT_EMAIL,
    subject,
    html: `<p>External API usage alert for <strong>${service}</strong>.</p>
           <p>Current month usage: <strong>${count}</strong> requests.</p>
           <p>Limit: ${LIMITS[service].stop} | Warning threshold: ${LIMITS[service].warn}</p>
           <p>Status: <strong>${type === 'stopped' ? 'API calls STOPPED automatically' : 'Approaching limit — still running'}</strong></p>`,
  }).catch(console.error)
}

export async function checkExternalUsage(service: Service): Promise<{
  allowed: boolean
  nearingLimit: boolean
  reason: string
}> {
  const month = getCurrentMonth()
  const { data } = await supabaseAdmin
    .from('api_usage_external')
    .select('request_count, stopped')
    .eq('service', service)
    .eq('month', month)
    .single()

  if (!data) return { allowed: true, nearingLimit: false, reason: 'ok' }
  if (data.stopped || data.request_count >= LIMITS[service].stop) {
    return { allowed: false, nearingLimit: false, reason: 'limit_reached' }
  }
  if (data.request_count >= LIMITS[service].warn) {
    return { allowed: true, nearingLimit: true, reason: 'nearing_limit' }
  }
  return { allowed: true, nearingLimit: false, reason: 'ok' }
}

export async function recordExternalUsage(service: Service): Promise<void> {
  const month = getCurrentMonth()
  const limits = LIMITS[service]

  const { data, error } = await supabaseAdmin.rpc('increment_external_usage', {
    p_service: service,
    p_month:   month,
  })

  if (error) {
    console.error(`[recordExternalUsage] ${service}:`, error)
    return
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return

  const count = row.request_count as number

  if (count >= limits.stop && !row.stopped) {
    await supabaseAdmin.rpc('set_external_usage_flag', {
      p_service: service,
      p_month:   month,
      p_stopped: true,
    })
    await sendLimitAlert(service, count, 'stopped')
    return
  }

  if (count >= limits.warn && !row.warning_sent) {
    await supabaseAdmin.rpc('set_external_usage_flag', {
      p_service: service,
      p_month:   month,
      p_warning_sent: true,
    })
    await sendLimitAlert(service, count, 'warning')
  }
}
