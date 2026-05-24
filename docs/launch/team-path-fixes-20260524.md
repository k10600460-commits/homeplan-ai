# Team プラン経路修正 — 実施レポート

**実施日**: 2026-05-24  
**対象**: R-01・R-02（plan-copy-consistency レポートで報告した未修正不一致）+ 作業3（Team 経路整合点検）  
**commit**: 以下を参照

---

## R-01: ダッシュボード価格表示（$49 → プランに応じた価格）

### 原因

`src/app/dashboard/page.tsx` の Supabase SELECT が `plan` カラムを含んでいなかった。  
`DashboardClient.tsx` は `Subscription` インターフェースに `plan` を持っておらず、価格を `"$49/month"` とハードコードしていた。

### 修正内容

**`src/app/dashboard/page.tsx`**

```ts
// Before:
.select("status, trial_end, current_period_end, stripe_customer_id, cancel_at_period_end")

// After:
.select("status, trial_end, current_period_end, stripe_customer_id, cancel_at_period_end, plan")
```

```ts
// Before: (plan フィールドなし)
subscription={{ status, trialEnd, periodEnd, customerId, cancelAtPeriodEnd, isActive }}

// After:
subscription={{ status, plan: subscription.plan ?? "pro", trialEnd, periodEnd, customerId, cancelAtPeriodEnd, isActive }}
```

**`src/app/dashboard/DashboardClient.tsx`**

```ts
// Before (Subscription interface):
interface Subscription {
  status: string;
  trialEnd: string | null;
  ...
}

// After:
interface Subscription {
  status: string;
  plan: "free" | "pro" | "team";
  trialEnd: string | null;
  ...
}
```

```tsx
// Before (line 373):
{subscription?.isActive && (
  <span className="text-sm text-gray-500">$49/month</span>
)}

// After:
{subscription?.isActive && (
  <span className="text-sm text-gray-500">
    {subscription.plan === "team" ? "$149/month" : "$49/month"}
  </span>
)}
```

### 補足

`subscriptions.plan` カラムは webhook `upsertSubscription()` が `planFromPriceId(item.price.id)` で書き込んでいる（アクティブ時 "pro"/"team"、解約後 "free"）。サーバーサイドで正確なプランを取得できるためフラッシュなし。

---

## R-02: キャンセルメール件名・本文の "Pro" ハードコード

### 原因

`sendCancellationEmail()` が `plan` を受け取らず、件名・H1・本文すべてに "Pro" をハードコードしていた。Team 解約でも "SplanAI Pro access" と表示。

### 修正内容

**`src/lib/emails.ts` — `sendCancellationEmail`**

```ts
// Before:
export async function sendCancellationEmail(to: string, periodEndDate: string) {
  // subject: "Your SplanAI Pro access continues until ..."
  // h1: "Your Pro access is still active"
  // body: "Your SplanAI Pro subscription remains..."
  // li: "Generate up to 100 floor plans per month"  (Team には不正確)

// After:
export async function sendCancellationEmail(to: string, periodEndDate: string, plan: "pro" | "team" = "pro") {
  const planLabel = plan === "team" ? "Team" : "Pro";
  const generationsItem = plan === "team"
    ? "Generate unlimited floor plans"
    : "Generate up to 100 floor plans per month";
  // subject: "Your SplanAI ${planLabel} access continues until ..."
  // h1: "Your ${planLabel} access is still active"
  // body: "Your SplanAI ${planLabel} subscription remains..."
  // li: "${generationsItem}"
```

**`src/app/api/stripe/webhook/route.ts`**

```ts
// Before:
sendCancellationEmail(userData.user.email, periodEnd).catch(console.error);

// After:
const plan = planFromPriceId(item.price.id);
sendCancellationEmail(userData.user.email, periodEnd, plan).catch(console.error);
```

---

## 作業3: Team 経路整合点検 — 追加修正

### Trial Reminder メール（`sendTrialReminderEmail`）

同様の問題: 件名・本文・価格が全員 "Pro" / "$49/month" ハードコード。Team トライアルユーザーも受け取る。

**`src/lib/emails.ts` — `sendTrialReminderEmail`**

| 箇所 | Before | After |
|------|--------|-------|
| パラメータ | `(to, trialEndDate)` | `(to, trialEndDate, plan: "pro"\|"team" = "pro")` |
| subject | `"Your SplanAI Pro trial ends in 3 days"` | `"Your SplanAI ${planLabel} trial ends in 3 days"` |
| body (SplanAI) | `"You've been using SplanAI Pro —"` | `"You've been using SplanAI ${planLabel} —"` |
| body (generations) | `"100 floor plan generations/month"` (Team に不正確) | Team: `"unlimited floor plan generations"` |
| body (price) | `"$49/month"` (Team に不正確) | Team: `"$149/month"` |

**`src/app/api/cron/trial-reminder/route.ts`**

```ts
// Before:
.select("user_id, trial_end")
await sendTrialReminderEmail(user.user.email, dateStr).catch(console.error);

// After:
.select("user_id, trial_end, plan")
const plan = row.plan === "team" ? "team" : "pro";
await sendTrialReminderEmail(user.user.email, dateStr, plan).catch(console.error);
```

### 作業3 — 追加点検結果（修正不要）

| # | 箇所 | 確認内容 | 判定 |
|---|------|---------|------|
| C-01 | `DashboardClient.tsx:97` | `isPro = subscription?.isActive` — Pro/Team 両方 true。MLS・結果ページのゲートとして使用。正しい。 | ✅ |
| C-02 | `DashboardClient.tsx:727` | `{userPlan === "free"}` で CTA 表示。Free ユーザーのみ。正しい。 | ✅ |
| C-03 | `DashboardClient.tsx:749` | `{userPlan === "pro"}` で Team アップセル CTA 表示。Pro ユーザーのみ。正しい。 | ✅ |
| C-04 | `emails.ts:102` | Team 招待メール "Unlimited AI floor plan generations" — Team 向けなので正しい。 | ✅ |
| C-05 | `webhook/route.ts` 全体 | `planFromPriceId` で Pro/Team を正確に判別。subscription upsert は plan を正しく書き込む。 | ✅ |
| C-06 | 課金額そのもの | Stripe で Pro=$49/Team=$149 が設定されているかは Stripe Dashboard で確認要（コード側は STRIPE_PRICE_ID / STRIPE_TEAM_PRICE_ID 環境変数依存。変更なし）。 | — |

---

## テスト

```
npx tsc --noEmit → エラーなし（出力なし）
```

```
grep "SplanAI Pro\|Your Pro\|\$49/month" src/lib/emails.ts src/app/dashboard/DashboardClient.tsx
→ ヒットなし ✅
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/app/dashboard/page.tsx` | plan カラムを SELECT 追加・subscription prop に plan 追加 |
| `src/app/dashboard/DashboardClient.tsx` | Subscription インターフェースに plan 追加・価格表示を動的化 |
| `src/lib/emails.ts` | `sendCancellationEmail` / `sendTrialReminderEmail` に plan パラメータ追加 |
| `src/app/api/stripe/webhook/route.ts` | `sendCancellationEmail` に plan を渡す |
| `src/app/api/cron/trial-reminder/route.ts` | plan カラムを SELECT 追加・`sendTrialReminderEmail` に plan を渡す |

---

## 参照

- `docs/launch/plan-copy-consistency-20260524.md` — 前回作業（R-01・R-02 を未修正として報告）
