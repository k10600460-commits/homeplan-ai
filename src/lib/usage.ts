import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Admin users bypass generation limits entirely.
// Set ADMIN_USER_IDS as a comma-separated list of Supabase user UUIDs in env.
function isAdminUser(userId: string): boolean {
  const ids = process.env.ADMIN_USER_IDS ?? ''
  if (!ids) return false
  return ids.split(',').map(s => s.trim()).includes(userId)
}

// ─── プラン設定 ───────────────────────────────
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3,   label: 'Free Plan' },
  pro:  { requestsPerMonth: 100, label: 'Pro Plan ($49/mo)' },
  team: { requestsPerMonth: 9999, label: 'Team Plan ($149/mo)' },
} as const

export type Plan = keyof typeof PLAN_LIMITS

// ─── ヘルパー ─────────────────────────────────
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── ユーザーのプラン取得 ──────────────────────
/** How long after trial_end a `trialing` row keeps its entitlement. */
const TRIALING_GRACE_MS = 7 * 24 * 60 * 60 * 1000

export async function getUserPlan(userId: string): Promise<Plan> {
  // 1. 直接サブスクリプションを確認
  // maybeSingle, not single: "no row" is the normal case for a free user and
  // must not surface as an error.
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status, trial_end')
    .eq('user_id', userId)
    .maybeSingle()

  // A `trialing` row only entitles while the trial is actually running.
  // Reading status alone meant a row whose trial had ended stayed entitled
  // forever — found in production on 2026-09-18 with trial_end 110 days in the
  // past, still returning 'pro' (100 generations/month) on every call. Harmless
  // that time because it was a founder test account; on a real customer it is a
  // straight revenue leak.
  //
  // The 7-day grace is deliberately generous. Stripe flips trialing -> active
  // only when the first invoice settles, and the webhook recording it can lag;
  // cutting off a paying customer during that window is by far the worse error.
  // A row still wrong after 7 days has already given the daily
  // reconcile-subscriptions cron six chances to correct it from Stripe. The two
  // are designed as a pair: this is the strict read, that is the repair.
  const trialStillValid =
    !sub?.trial_end || Date.now() - new Date(sub.trial_end).getTime() < TRIALING_GRACE_MS
  const entitled =
    sub?.status === 'active' || (sub?.status === 'trialing' && trialStillValid)

  if (entitled) {
    if (sub.plan === 'team') return 'team'
    if (sub.plan === 'pro')  return 'pro'
  }

  // 2. team_members テーブルでアクティブメンバーか確認
  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (member) return 'team'

  return 'free'
}

// ─── 今月の使用量取得 ──────────────────────────
export async function getMonthlyUsage(userId: string) {
  const { data } = await supabaseAdmin
    .from('api_usage')
    .select('request_count, token_count, estimated_cost_usd')
    .eq('user_id', userId)
    .eq('month', getCurrentMonth())
    .single()

  return {
    requestCount:     data?.request_count      ?? 0,
    tokenCount:       data?.token_count         ?? 0,
    estimatedCostUsd: data?.estimated_cost_usd  ?? 0,
  }
}

// ─── 上限チェック ──────────────────────────────
export async function checkUsageLimit(userId: string): Promise<{
  allowed:   boolean
  plan:      Plan
  current:   number
  limit:     number
  remaining: number
}> {
  // Admin bypass: skip all limit checks for founder/test accounts
  if (isAdminUser(userId)) {
    return { allowed: true, plan: 'team', current: 0, limit: 9999, remaining: 9999 }
  }

  const [plan, usage] = await Promise.all([
    getUserPlan(userId),
    getMonthlyUsage(userId),
  ])

  const limit     = PLAN_LIMITS[plan].requestsPerMonth
  const current   = usage.requestCount
  const remaining = Math.max(0, limit - current)

  return { allowed: current < limit, plan, current, limit, remaining }
}

// ─── 使用量記録（API呼び出し後に実行） ───────────
export async function recordApiUsage(
  userId:       string,
  inputTokens:  number,
  outputTokens: number
): Promise<void> {
  const costUsd =
    (inputTokens  / 1_000_000) * 3.0 +
    (outputTokens / 1_000_000) * 15.0

  const { error } = await supabaseAdmin.rpc('increment_api_usage', {
    p_user_id: userId,
    p_month:   getCurrentMonth(),
    p_requests: 1,
    p_tokens:  inputTokens + outputTokens,
    p_cost:    costUsd,
  })

  if (error) {
    // Fail loud (OI-037). A silent failure here is exactly how the last outage
    // hid for months: production had two overloads of increment_api_usage
    // (int vs bigint p_tokens), PostgREST could not resolve one from a JSON
    // body (PGRST203), every call failed — and this console.error was the only
    // trace. The damage is invisible but severe: api_usage is never written, so
    // the free 3/month cap goes unenforced AND checkUsageLimit reports
    // current=0 forever, which means no free user ever reaches /upgrade.
    // Metering must never fail quietly again.
    console.error('[recordApiUsage] error:', error)
    const { recordError } = await import('./observability')
    await recordError(
      'lib/usage.recordApiUsage',
      500,
      `increment_api_usage failed [${error.code ?? 'unknown'}] ${error.message}` +
        ' — usage is NOT being metered: free cap unenforced and /upgrade unreachable',
      error.details ?? null,
    )
  }
}
