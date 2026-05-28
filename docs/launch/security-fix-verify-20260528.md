# Security Fix Verification — Round 1 (2026-05-28)

**検証日**: 2026-05-28  
**対象修正**: H-1 / H-2 / H-3 / M-6 / M-7  
**検証方針**: コード・.env・Stripe設定・git は変更しない。  
**参照**: `security-audit-20260528.md`

---

## サマリー

| 項目 | 結果 |
|------|------|
| A. 静的検証（コード読解） | ✅ 全 PASS |
| B. ビルド / 型 / リント | ✅ PASS（lint エラーは修正対象外の既存ファイルのみ） |
| C. ランタイム負パス（dev server 実測） | ✅ 全 PASS — 3ルートとも 401 確認 |
| D. ハッピーパス（コード+型） | ✅ PASS（E2E は要スモーク — 後述） |
| E. 横展開（取りこぼし確認） | ✅ 該当なし |

---

## A. 静的検証

### A-H-1: `stripe/team-checkout/route.ts` ✅ PASS

**根拠**:

| チェック | 結果 | ファイル:行 |
|----------|------|------------|
| `createClient()` import あり | ✅ | `stripe/team-checkout/route.ts:2` |
| `supabase.auth.getUser()` 呼び出し | ✅ | `:23` |
| `!user` → 401 返却 | ✅ | `:24-26` |
| `req.json()` で `userId` / `email` を読まない | ✅ | `req.json()` 呼び出し自体なし |
| `user.id` を `metadata.userId` に使用 | ✅ | `:62, :65` |
| `user.email` を `customer_email` に使用 | ✅ | `:73` |
| rate limit (5/15min/IP) 追加 | ✅ | `:14-18` |

**/api/checkout との認証・trial スキップ・subscription lookup パターン比較**:

```
team-checkout                               /api/checkout
─────────────────────────────────────────── ───────────────────────────────────────
rate limit 5/15min → 429                    rate limit 5/15min → 429          ✅ 一致
createClient().auth.getUser()               createClient().auth.getUser()      ✅ 一致
!user → 401                                 !user → 401                        ✅ 一致
supabaseAdmin.subscriptions                 supabaseAdmin.subscriptions        ✅ 一致
  .select("stripe_customer_id, status")       .select("stripe_customer_id, status") ✅
  .eq("user_id", user.id)                     .eq("user_id", user.id)          ✅ 一致
trialDays = sub ? 0 : TRIAL_PERIOD_DAYS     trialDays = sub ? 0 : TRIAL_PERIOD_DAYS ✅ 一致
stripe.customers.retrieve() + deleted check stripe.customers.retrieve() + deleted ✅ 一致
sessionParams.customer = liveCustomerId     sessionParams.customer = ...       ✅ 一致
sessionParams.customer_email = user.email   sessionParams.customer_email = user.email ✅ 一致
```

---

### A-H-2: `stripe/portal/route.ts` ✅ PASS

| チェック | 結果 | ファイル:行 |
|----------|------|------------|
| `supabase.auth.getUser()` 呼び出し | ✅ | `:14` |
| `!user` → 401 | ✅ | `:15-17` |
| `req.json()` 呼び出しなし | ✅ | ファイル全体確認済 |
| `customerId` 変数の参照なし | ✅ | ファイル全体確認済（grep 結果: 該当なし） |
| `supabaseAdmin.subscriptions.select("stripe_customer_id").eq("user_id", user.id)` | ✅ | `:20-24` |
| `!sub?.stripe_customer_id` → 404 | ✅ | `:26-28` |
| `stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id })` | ✅ | `:33` |

---

### A-H-3: `generate-pdf/route.ts` ✅ PASS

| チェック | 結果 | ファイル:行 |
|----------|------|------------|
| `import { createClient } from '@/lib/supabase/server'` | ✅ | `:4` |
| `POST()` 冒頭で `createClient().auth.getUser()` | ✅ | `:197-199` |
| `!user` → `{ error: 'Unauthorized' }`, status 401 | ✅ | `:199-201` |
| 既存の `planData` / `language` 検証はそのまま保持 | ✅ | `:207-209` |

---

### A-M-6: `api/checkout/route.ts` ✅ PASS

| チェック | 結果 | ファイル:行 |
|----------|------|------------|
| `stripeMsg` 変数の削除 | ✅ | 削除確認済 |
| response body に生 Stripe エラー含まず | ✅ | `"Checkout session creation failed. Please try again."` のみ |
| `console.error("[checkout] Stripe error:", error)` | ✅ | `:85` — サーバーログに詳細残る |

---

### A-M-7: `mls/connect/route.ts` ✅ PASS

| チェック | 結果 | ファイル:行 |
|----------|------|------------|
| `{ error: msg }` → `{ error: "MLS connection failed. Please try again." }` | ✅ | `:122` |
| `console.error("[MLS connect]", err)` | ✅ | `:121` — サーバーログに詳細残る |
| Trestle 認証エラー (401/400) の分岐は保持 | ✅ | `:115-119` — 既存の「Invalid credentials」分岐は変更なし |

---

## B. ビルド / 型 / リント

### ビルド ✅ PASS

```
✓ Compiled successfully in 3.1s
✓ Generating static pages using 7 workers (37/37) in 218ms
TypeScript: PASS
```

### リント: 修正対象ファイルのエラーなし ✅

`npm run lint` の 13 errors / 10 warnings は全て修正対象外の既存ファイル:
- `DashboardClient.tsx` — `react-hooks/exhaustive-deps` 等（pre-existing）
- `invite/page.tsx` — `react-hooks` 系（pre-existing）
- `upgrade/page.tsx` — `@next/next/no-html-link-for-pages`（pre-existing）
- `SharePortalClient.tsx` — `react-hooks` 系（pre-existing）
- `tests/` 配下 — unused vars（pre-existing）

修正した 5 ファイルにリントエラーなし（grep 確認済）。

---

## C. ランタイム負パス検証 ✅ 全 PASS

dev server (`npm run dev`) 起動後、未認証（Cookie なし）で POST:

| エンドポイント | 期待値 | 実測 HTTP Status | レスポンス body |
|---------------|--------|-----------------|----------------|
| `POST /api/stripe/team-checkout` | 401 | **401** ✅ | `{"error":"Unauthorized"}` |
| `POST /api/stripe/portal` | 401 | **401** ✅ | `{"error":"Unauthorized"}` |
| `POST /api/generate-pdf` | 401 | **401** ✅ | `{"error":"Unauthorized"}` |

認証ゲートが Stripe / pdfmake に到達する前に弾いていることを実動作で確認。

---

## D. ハッピーパス（コード + 型）

**H-1 team-checkout (認証あり)**:
- `user.id` → `metadata.userId`, `client_reference_id`: Webhook がこの値を信頼して subscription を upsert するため、正しい userId が設定される。
- 既存 sub あり → `trialDays = 0` → Stripe session に `trial_period_days` を渡さない（二重 trial 防止）。
- 既存 Stripe customer ID があれば再利用し `customer_email` は不送信（重複 customer 防止）。
- TypeScript 型エラーなし（build ✅）。

**H-2 portal (認証あり)**:
- `supabaseAdmin` で DB から `stripe_customer_id` を取得するため、認証ユーザー以外の portal を開けない。
- `stripe_customer_id` がない場合（Free プランユーザー）は 404 → フロントで適切にハンドリング必要（後述 残課題）。

**H-3 generate-pdf (認証あり)**:
- auth ゲートを通過すれば既存の PDF 生成ロジックはそのまま実行される。

⚠️ **E2E スモークテスト（本番確認が必要な項目）** — 自動化不可（ライブ決済を発生させてはならない）:
1. Team プランのチェックアウトフロー（認証済みユーザーで Stripe Checkout 画面が表示されるか）
2. ビリングポータルボタン（Pro/Team subscription を持つユーザーでポータルが開くか）
3. 中国語 PDF ダウンロード（dashboard / share portal 両経路）

---

## E. 横展開チェック

### E-1: 未認証で課金/高負荷を起こせる他ルート

| 種別 | ルート | 状態 |
|------|--------|------|
| 認証あり課金API | generate, neighborhood, checkout, mls/* 等 | ✅ 全て `getUser()` あり |
| CRON_SECRET 保護 | cron/daily-brief, finance-snapshot, legal-watch, reset-external-usage, sales-dm-draft, seo-draft, trial-reminder | ✅ 全 7 本 CRON_SECRET 確認済 |
| 意図的公開（課金なし） | `share/event` | ✅ Stripe/Claude/Google Maps/RentCast/pdfmake 呼び出しなし（DB write のみ） |

**→ 取りこぼしなし**

### E-2: body から userId/customerId など本人性に関わる値を信頼している他ルート

全 API ルートを対象に `req.json.*userId|body\.userId|body\.customerId|req.json.*customerId` パターンで grep:

```
(検索結果: 0 件)
```

`team-checkout` が修正により該当なしになり、他ルートにも残存なし。

**→ 該当なし**

---

## 残課題（今回の修正で生じた新規課題）

### 要確認: H-2 portal — Free プランユーザーへの影響

修正前の `/api/stripe/portal` は `customerId` をクライアントから受け取っていた。  
修正後は DB から `stripe_customer_id` を引くため、**サブスクリプション未所持ユーザー（Free プラン）が portal ボタンを叩くと 404** になる。

フロントエンド（`DashboardClient.tsx`）がこの 404 ケースを適切にハンドリングしているか確認が必要。

**確認方法**: Free プランアカウントでビリングポータルボタンが存在するかどうかを dashboard の UI で確認。ボタンが存在しない（Free プランには非表示）なら問題なし。

---

## 最終 PASS/FAIL サマリー

| # | 修正項目 | 静的 A | ランタイム C | 判定 |
|---|----------|--------|-------------|------|
| H-1 | team-checkout 認証 | ✅ PASS | ✅ 401 実測 | **PASS** |
| H-2 | portal 所有権 | ✅ PASS | ✅ 401 実測 | **PASS** |
| H-3 | generate-pdf 認証 | ✅ PASS | ✅ 401 実測 | **PASS** |
| M-6 | checkout エラー隠蔽 | ✅ PASS | — (build 確認) | **PASS** |
| M-7 | MLS connect エラー隠蔽 | ✅ PASS | — (build 確認) | **PASS** |
| B | ビルド / 型 / リント | ✅ PASS | | **PASS** |
| E | 横展開チェック | 取りこぼしなし | | **PASS** |

**push はしていない。Preview 検証 → push の判断は所有者に委ねる。**

---

_検証日: 2026-05-28 | コミット: e21d4dc ベース + 修正 5 件（未 push）_
