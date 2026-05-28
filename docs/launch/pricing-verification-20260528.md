# 料金体系確認レポート

**調査日**: 2026-05-28  
**調査者**: /investigate skill  
**調査開始**: 2026-05-26（データ収集完了）

---

## Question

現在の料金体系を確定する — Free / Pro / Team の各プランについて、月額価格・generations の上限（無制限 or 月N回）・主要な機能差を、コード上の plans 設定 / usage.ts / Stripe の価格定義 / 料金ページを根拠に確認する。CLAUDE.md の Pricing セクションと一致しているかも照合し、不一致があれば指摘する。

---

## Answer

### プラン比較表

| | Free | Pro | Team |
|---|---|---|---|
| **月額** | $0 | $49/mo | $149/mo |
| **Generations 上限** | 3回/月 | 100回/月 | 9999（実質無制限・Fair Use 適用） |
| **PDF** | SplanAI ブランド入り | ユーザーロゴ入りブランド PDF | ホワイトラベル（SplanAI 表記なし） |
| **MLS データ（Trestle）** | ✗ | ✅ | ✅ |
| **近隣・市場データ** | ✅ | ✅ | ✅ |
| **クライアント共有ポータル** | ✅ | ✅ | ✅ |
| **チームメンバー** | 1名 | 1名 | 5〜15名 |
| **チームダッシュボード・KPI** | ✗ | ✗ | ✅ |
| **サポート** | Email | Priority | Dedicated |
| **クレジットカード** | 不要（サインアップのみ） | 必須（14日間 trial 後課金） | 必須（14日間 trial 後課金） |
| **Free Trial** | — | 14日間 | 14日間 |

---

## Evidence

### 1. Generation 上限 — `src/lib/usage.ts:9-13`

```ts
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3,    label: 'Free Plan' },
  pro:  { requestsPerMonth: 100,  label: 'Pro Plan ($49/mo)' },
  team: { requestsPerMonth: 9999, label: 'Team Plan ($149/mo)' },
} as const
```

- Free = 3、Pro = 100、Team = 9999（番兵値。`Infinity` は JSON.stringify で null になるため不採用）。
- `checkUsageLimit()` は `current < limit` で判定（`usage.ts:84`）。Team が 9999 を超えることは通常運用では起きない。

### 2. 月額価格 — `src/app/HomePageClient.tsx:88-90`

```ts
free: { label: "Free", price: "$0", ... }
pro:  { label: "Pro",  price: "$49", period: "/mo", ... }
team: { label: "Team", price: "$149", period: "/mo", ... }
```

価格は LP の pricing copy に直書きされており、Stripe の Price ID（環境変数 `STRIPE_PRICE_ID` / `STRIPE_TEAM_PRICE_ID`）と紐付く。コードから Stripe 側の実際の金額は読み取れない（環境変数依存）。

### 3. Free Trial — `src/lib/stripe.ts:19`

```ts
export const TRIAL_PERIOD_DAYS = 14;
```

全 checkout routes（`/api/checkout/route.ts:45`、`/api/stripe/checkout/route.ts:39`、`/api/stripe/team-checkout/route.ts:23`）が `trial_period_days: TRIAL_PERIOD_DAYS` を使用。既存サブスクリプションレコードがある場合は trial をスキップ（`trialDays = sub ? 0 : TRIAL_PERIOD_DAYS`）。

### 4. カード必須 — 全 checkout routes

```ts
payment_method_collection: "always"
```

`/api/checkout/route.ts:62`、`/api/stripe/checkout/route.ts:55` に明記。Trial 開始時にカード登録を要求する（trial_anchor_billing 方式ではなく、初期から card required）。

### 5. Team "Unlimited*" の実態 — `src/app/HomePageClient.tsx:90` + `src/app/terms/page.tsx:71,96-130`

LP 表記は "Unlimited floor plan generations*"（アスタリスク付き）。Terms §4（`id="fair-use"`）に Fair Use Policy として、"9999 という内部上限を非公開にした上で、通常使用においては固定上限を適用しない" 旨が記載されている。

### 6. 主要機能差 — `src/app/HomePageClient.tsx:88-90`（EN プラン features 配列）

- **Free features**: 3 floor plan generations/month、SplanAI branded PDF export、Neighborhood & market data、Client sharing portal + view tracking、All room types、Email support
- **Pro features**: 100 floor plan generations/month、Branded PDF with your logo、MLS lot data connection via Trestle、Priority support
- **Team features**: Unlimited floor plan generations*、Everything in Pro、5–15 team members、Team dashboard & member KPIs、White-label PDF（your logo only, no SplanAI branding）、Dedicated support

### 7. Free プランのチェックアウト不要 — `src/lib/usage.ts:48`

```ts
return 'free'  // subscriptions レコードなし → free プラン
```

Free は DB の subscriptions テーブルにレコードが存在しない状態で動作。Stripe checkout は不要（サインアップのみ）。

---

## Assumptions & gaps

### 1. Stripe 側の価格金額は未確認

`STRIPE_PRICE_ID` / `STRIPE_TEAM_PRICE_ID` は環境変数であり、コードから Stripe Dashboard 上の実際の価格を読み取ることはできない。コード側は $49/$149 を LP に表示しているが、Stripe Dashboard の設定と一致しているかは本レポートでは確認できない。

**推奨**: Stripe Dashboard で `STRIPE_PRICE_ID` の unit_amount が 4900（$49）、`STRIPE_TEAM_PRICE_ID` が 14900（$149）であることを手動確認。

### 2. PRODUCTHUNT プロモコードが未実装

CLAUDE.md に "Promo code PRODUCTHUNT = 1 month free, through June 30, 2026" と記載があるが、**3つの checkout route すべてに `allow_promotion_codes: true` が存在しない**。Stripe Checkout の画面にプロモコード入力欄は表示されず、ユーザーは PRODUCTHUNT コードを適用できない状態。

根拠: `/api/checkout/route.ts`、`/api/stripe/checkout/route.ts`、`/api/stripe/team-checkout/route.ts` に `allow_promotion_codes` キーなし（grep 結果ゼロ）。

**推奨**: checkout routes に `allow_promotion_codes: true` を追加 + Stripe Dashboard でプロモコード "PRODUCTHUNT" を作成する必要がある。または CLAUDE.md から当該記載を削除。

---

## CLAUDE.md Pricing との照合

現行 CLAUDE.md（2026-05-26 修正後）:

```
- Free: signup required, no credit card.
- Pro $49/mo: 100 generations/month, MLS data via Trestle.
- Team $149/mo: 5–15 users, white-label.
- Promo code PRODUCTHUNT = 1 month free, through June 30, 2026.
```

| 項目 | CLAUDE.md | コード実態 | 評価 |
|------|-----------|-----------|------|
| Free: no credit card | ✅ | checkout route なし・サインアップのみ | ✅ 一致 |
| Pro: $49/mo | ✅ | LP `price: "$49"` | ✅ 一致（Stripe 側は未確認） |
| Pro: 100 generations/month | ✅ | `usage.ts:11` `requestsPerMonth: 100` | ✅ 一致 |
| Pro: MLS data via Trestle | ✅ | LP features に "MLS lot data connection via Trestle" | ✅ 一致 |
| Team: $149/mo | ✅ | LP `price: "$149"` | ✅ 一致（Stripe 側は未確認） |
| Team: 5–15 users | ✅ | LP "5–15 team members"・terms §3 | ✅ 一致 |
| Team: white-label | ✅ | LP "White-label PDF"・terms §3 | ✅ 一致 |
| 14日間 Trial | **未記載** | `TRIAL_PERIOD_DAYS = 14`（stripe.ts:19）+ 全 checkout route | ⚠️ CLAUDE.md に記載なし |
| PRODUCTHUNT プロモコード | 記載あり | `allow_promotion_codes` なし → 未実装 | ❌ コードと不一致 |

---

## Implications

1. **CLAUDE.md に 14日間 trial の記載を追加推奨**: 現状 CLAUDE.md には trial 期間が書かれていない。AI が誤った回答をするリスクがある。

2. **PRODUCTHUNT プロモコードは未実装**: 告知済みのプロモコードがユーザー側で使えない状態。対応は2択:
   - 各 checkout route に `allow_promotion_codes: true` を追加し、Stripe Dashboard でコードを作成する
   - プロモコード施策を取りやめ、CLAUDE.md から記載を削除する

3. **Stripe 側の価格金額を手動確認**: コード単独では Stripe Dashboard の設定を読み取れない。$49/$149 の unit_amount は Stripe 側で確認要。

---

*根拠ファイル: `src/lib/usage.ts` / `src/lib/stripe.ts` / `src/app/HomePageClient.tsx` / `src/app/api/checkout/route.ts` / `src/app/api/stripe/checkout/route.ts` / `src/app/api/stripe/team-checkout/route.ts` / `src/app/terms/page.tsx`*
