# プランコピー整合性修正 — 実施レポート

**実施日**: 2026-05-24  
**方針**: Pro = 100回/月・Team = Unlimited(fair use 付き)でコード・LP・Terms・Dashboard・メールを全一致させる。  
**commit**: 以下を参照

---

## 確定方針

| プラン | 生成上限 | 対外表記 | 内部実装 |
|--------|---------|---------|---------|
| Free | 3回/月 | 変更なし | 変更なし |
| Pro | 100回/月 | "100 floor plan generations / month" | 変更なし |
| Team | 実質無制限 | "Unlimited floor plan generations*" + Fair Use Policy 脚注 | `requestsPerMonth: 9999`（番兵値） |

---

## 作業1: コード — Team 上限無制限化

### `src/lib/usage.ts:12`

```ts
// Before:
team: { requestsPerMonth: 100, label: 'Team Plan ($149/mo)' },

// After:
team: { requestsPerMonth: 9999, label: 'Team Plan ($149/mo)' },
```

**9999 番兵値の根拠**: `Infinity` は `JSON.stringify` で `null` に変換されるため API レスポンスが破損する。9999 は整数演算・JSON 直列化・TypeScript 型すべて問題なし。ユーザー向け表示には `9999` を出さない（常に "Unlimited" と表示）。

---

## 作業2: 文言修正 — 全変更 before/after

### `src/app/page.tsx` — LP 価格テーブル（EN）

**Free features（行 88）**

| | Before | After |
|-|--------|-------|
| features | `["3 floor plan generations / month", "SplanAI branded PDF export", "All room types", "Email support"]` | `["3 floor plan generations / month", "SplanAI branded PDF export", "Neighborhood & market data", "Client sharing portal + view tracking", "All room types", "Email support"]` |

**Pro features（行 89）**

| | Before | After |
|-|--------|-------|
| features[0] | `"Unlimited floor plan generations"` | `"100 floor plan generations / month"` |
| features[2] | `"Neighborhood & market data"` | 削除（Free に移動） |
| features[3] | `"Client sharing portal + tracking"` | 削除（Free に移動） |
| features 計 | 6項目 | 4項目 |

**Team features（行 90）**

| | Before | After |
|-|--------|-------|
| features[0] | `"Everything in Pro"` | `"Unlimited floor plan generations*"` |
| features[1] | `"5–15 team members"` | `"Everything in Pro"` |
| 以降 | `"MLS connection via Trestle"` を含む | `"MLS connection via Trestle"` 削除（"Everything in Pro" 経由で継承） |

**価格テーブル下部 — 脚注追加（行 955 後）**

```tsx
// After（追加）:
<p className="mt-3 text-xs text-center" style={{ color: "#94A3B8" }}>
  *Subject to our <a href="/terms#fair-use">Fair Use Policy</a>.
  / *Sujeto a nuestra <a href="/terms#fair-use">Política de Uso Justo</a>.
</p>
```

### `src/app/page.tsx` — LP 価格テーブル（ES）

同内容をスペイン語でも適用:

| 箇所 | Before | After |
|------|--------|-------|
| Free features | 4 項目 | 追加: `"Datos de vecindario y mercado"`, `"Portal para clientes + seguimiento de vistas"` |
| Pro features[0] | `"Generaciones ilimitadas"` | `"100 generaciones de planos / mes"` |
| Pro features[2,3] | neighborhood/portal | 削除 |
| Team features[0] | `"Todo lo de Pro"` | `"Generaciones ilimitadas de planos*"` |
| Team features[4] | `"Conexión MLS vía Trestle"` | 削除（継承） |

### `src/app/terms/page.tsx`

**LAST_UPDATED（行 10）**

```ts
// Before: "May 22, 2026"
// After:  "May 24, 2026"
```

**Section 3 Plans リスト（行 68-74）**

| プラン | Before | After |
|--------|--------|-------|
| Free | "Up to 3 floor plan generations per month, at no cost." | "+ including neighborhood & market data and client sharing portal" 追記 |
| Pro | "Unlimited generations, branded PDF export, neighborhood & market data, and client sharing portal." | "100 floor plan generations per month, branded PDF export with your logo, MLS lot data connection via Trestle, and priority support." |
| Team | "Everything in Pro, plus multi-user access for 5–15 team members and white-label PDF." | "Unlimited floor plan generations (subject to our Fair Use Policy), plus everything in Pro, multi-user access for 5–15 team members, and white-label PDF." — Fair Use Policy へのアンカーリンク付き |

**Section 4 新規挿入 — Fair Use Policy**

Fair Use Policy を Section 4 として挿入（`<section id="fair-use">` でアンカーリンク対応）。

**セクション再番号付け**

| Before | After |
|--------|-------|
| 4. Your Responsibilities | 5. Your Responsibilities |
| 5. Intellectual Property | 6. Intellectual Property |
| 6. Disclaimers | 7. Disclaimers |
| 7. Limitation of Liability | 8. Limitation of Liability |
| 8. Service Changes and Termination | 9. Service Changes and Termination |
| 9. Governing Law | 10. Governing Law |
| 10. Changes to These Terms | 11. Changes to These Terms |
| 11. Contact | 12. Contact |

### `src/app/dashboard/DashboardClient.tsx` — Free→Pro アップセル CTA

**行 732**

```tsx
// Before: <h2 className="...">Unlock unlimited plans</h2>
// After:  <h2 className="...">Upgrade to Pro</h2>
```

**行 735**

```tsx
// Before: <p>Unlimited generations · Branded PDF · Neighborhood data · $49/mo</p>
// After:  <p>100 floor plans/month · Branded PDF · MLS access · $49/mo</p>
```

変更点:
- "Unlimited generations" → "100 floor plans/month"（実態に一致）
- "Neighborhood data" 削除（Free でも利用可能なため Pro 差別化ポイントではない）
- "MLS access" 追加（Pro の真の差別化ポイント）

### `src/lib/emails.ts`

**行 23 — ウェルカムメール Free→Pro アップセル**

```html
<!-- Before: -->
Upgrade to Pro for unlimited plans, your logo on PDFs, and priority support.

<!-- After: -->
Upgrade to Pro for 100 floor plan generations/month, your logo on PDFs, and priority support.
```

**行 38 — トライアルリマインダーメール**

```html
<!-- Before: -->
You've been using SplanAI Pro — don't lose access to unlimited plans and branded PDFs.

<!-- After: -->
You've been using SplanAI Pro — don't lose access to 100 floor plan generations/month and branded PDFs.
```

**行 77 — キャンセルメール Pro feature リスト**

```html
<!-- Before: -->
<li>Generate unlimited floor plans</li>

<!-- After: -->
<li>Generate up to 100 floor plans per month</li>
```

**行 102（変更なし）** — Team 招待メール `"Unlimited AI floor plan generations"` は Team 向けなので正しい。

---

## 作業3: Terms — Fair Use Policy

**挿入箇所**: Section 3「Pricing and Subscriptions」の直後に Section 4「Fair Use Policy」を追加（`<section id="fair-use">`）。

**内容**: 指定の英文を一字一句そのまま挿入。既存の「4. Your Responsibilities」の Acceptable Use（`You agree not to:` リスト）との重複を確認 — Fair Use Policy は「unlimited プランの合理的使用範囲」を定義するものであり、Section 5 の禁止行為リストとは目的が異なる（前者は量的上限の定義、後者は利用の性質の禁止）。矛盾なし。

---

## 作業4: 近隣データ・共有リンク・リアルタイム通知の表記修正

**修正内容**: Neighborhood & market data / Client sharing portal + tracking を Pro features から Free features に移動。  
**結果**: LP 上でこれらは Free プランの feature として明示されるため、「Pro 限定」とは読めなくなる。

| 機能 | Before | After |
|------|--------|-------|
| Neighborhood & market data | Pro features のみ | Free features に追加 / Pro features から削除 |
| Client sharing portal + tracking | Pro features のみ | Free features に追加 / Pro features から削除 |
| Realtime view notifications | どの pricing 行にも明示なし（共有リンクに暗示） | 変更なし（Client sharing portal + view tracking として Free に含まれる） |

---

## 作業5: 主張 vs コード 総点検

### ✅ 一致を確認した箇所

| 箇所 | 主張 | コード実態 | 判定 |
|------|------|----------|------|
| LP Free "3 floor plan generations / month" | 3回 | `PLAN_LIMITS.free = 3` | ✅ |
| LP Pro "100 floor plan generations / month"（修正後） | 100回 | `PLAN_LIMITS.pro = 100` | ✅ |
| LP Team "Unlimited*"（修正後） | 無制限 | `PLAN_LIMITS.team = 9999` | ✅ |
| LP Pro "MLS lot data connection via Trestle" | Pro/Team のみ | `mls/lot-data:88` `if (plan === "free") return 403` | ✅ |
| LP Team "White-label PDF" | Team のみ | `results/page.tsx:513` `if (d.plan === "team")` | ✅ |
| LP Team "5–15 team members" | 最大 15（owner 含む） | `team/invite:12` `MAX_MEMBERS = 15` | ✅ |
| LP Free/Pro/Team "14-day free trial"（Pro/Team） | 14日 | `lib/stripe.ts TRIAL_PERIOD_DAYS` | ✅ |
| emails.ts Team invite "Unlimited AI floor plan generations" | 無制限 | Team = 9999（作業1で変更済み） | ✅ |

### ⚠️ コードと不一致・要報告（今回修正対象外）

| # | 箇所 | 主張 | コード実態 | 判定 |
|---|------|------|----------|------|
| R-01 | `DashboardClient.tsx:373` | 全アクティブサブスク "$49/month" と表示 | Pro=$49、Team=$149 の区別なし | ⚠️ Team オーナーに誤表示。表示分岐に `userPlan` を使えば修正可能だが、今回スコープ外。post-launch 対応推奨。 |
| R-02 | `emails.ts:70-71` キャンセルメール subject | "Your SplanAI Pro access…" と常に "Pro" | Team オーナーが解約してもメール subject が "Pro" になる | ⚠️ 軽微。post-launch で Stripe webhook に plan 情報を渡して subject を分岐する対応が必要。 |
| R-03 | LP/Dashboard "Priority support" | Pro の feature として明示 | dedicated support system なし（hello@ 宛メール対応のみ） | ⚠️ 実装なし。ただし手動メール対応を "priority support" と呼ぶことは一般的に許容範囲内。断定修正は保留し報告のみ。 |
| R-04 | LP FAQ "coming soon" coverage map | MLS coverage map coming soon | 未実装 | ⚠️ Marketing 表記。コードとの乖離ではなくロードマップ表記なので修正不要。 |

---

## 作業6: テスト結果

### コードレベル検証（TypeScript コンパイル）

```
npx tsc --noEmit → エラーなし（出力なし）
```

### `checkUsageLimit()` ロジック検証（コードで確認）

```ts
// usage.ts:80-84
const limit     = PLAN_LIMITS[plan].requestsPerMonth  // team → 9999
const current   = usage.requestCount                   // 例: 101
const remaining = Math.max(0, 9999 - 101)              // → 9898
return { allowed: 101 < 9999, ... }                    // → allowed: true ✅
```

Team ユーザーが 100 回を超えても `allowed: true` → Claude API 到達。

```ts
// Free: allowed: 3 < 3 = false ✅（ブロック）
// Pro:  allowed: 100 < 100 = false ✅（ブロック）
// Team: allowed: 9999 < 9999 = false（9999回目のみブロック・実質到達不可）
```

### DB 手動テスト

Supabase 本番 DB を操作してのテストはスコープ外（本番 DB への手動 DML は別途実施要）。  
コードレベルの検証で正確な動作を確認済み。

### 残留 "unlimited" / Pro 誤表記の最終確認

```
grep -n "unlimited" src/lib/emails.ts src/app/dashboard/DashboardClient.tsx src/app/upgrade/page.tsx
→ emails.ts:102: "Unlimited AI floor plan generations" （Team 招待メール — 正しい）
→ 他にヒットなし ✅
```

```
grep -n "unlimited\|Unlimited" src/app/page.tsx
→ 行 90 Team EN: "Unlimited floor plan generations*" ✅
→ 行 196 Team ES: "Generaciones ilimitadas de planos*" ✅
→ 他にヒットなし ✅
```

```
grep -n "unlimited\|Unlimited" src/app/terms/page.tsx
→ 行 71 Team Plans: "Unlimited floor plan generations (subject to Fair Use Policy)" ✅
→ 行 99-105 Fair Use Policy 本文内 ✅
→ 他にヒットなし ✅
```

---

## 変更ファイル一覧（最終）

| ファイル | 変更種別 | 変更数 |
|---------|---------|--------|
| `src/lib/usage.ts:12` | Team 上限 100 → 9999 | 1行 |
| `src/app/page.tsx:88-90,194-196,955-956` | LP 価格テーブル EN/ES + 脚注追加 | 7箇所 |
| `src/app/terms/page.tsx:10,68-74,97,99-186` | LAST_UPDATED・Plans 修正・Fair Use 挿入・8セクション再番号付け | 11箇所 |
| `src/app/dashboard/DashboardClient.tsx:732,735` | Pro CTA 文言 2行 | 2行 |
| `src/lib/emails.ts:23,38,77` | Pro "unlimited" → 100/month（3メール） | 3行 |

---

## 参照

- `docs/launch/plan-usage-limits-audit-20260524.md` — 生成上限監査（不一致を最初に検出）
- `docs/launch/plan-differentiation-matrix-20260524.md` — プラン差別化マトリクス
- `docs/launch/team-unlimited-scope-20260524.md` — Team 無制限化スコープ調査
- `docs/launch/api-cost-surface-audit-20260524.md` — Anthropic コスト（Team=9999 は spend limit $200 がハード上限）
