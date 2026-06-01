# Stripe Webhook Audit

**Question:** `src/app/api/stripe/webhook/route.ts` を読み、(1) どの環境変数で署名検証しているか、(2) test/live のシークレットを区別する作りか、(3) 検証失敗時に何を返すか、(4) 成功時に subscriptions テーブルへ何を書くか、を要約。

---

## Answer

### (1) 署名検証に使う環境変数

`process.env.STRIPE_WEBHOOK_SECRET` のみ。単一の環境変数で `stripe.webhooks.constructEvent()` に渡す。

### (2) test/live の区別

**区別なし。** 環境変数は 1 つだけ (`STRIPE_WEBHOOK_SECRET`)。test/live を切り替えるには手動でその変数を書き換えるか、Vercel の環境別変数（Preview / Production）で別値を設定する必要がある。コード上に自動切り替えロジックは存在しない。

### (3) 検証失敗時のレスポンス

| ケース | HTTP ステータス | Body |
|---|---|---|
| `stripe-signature` ヘッダが存在しない | `400` | `{ "error": "Missing stripe-signature" }` |
| `constructEvent()` が例外を投げる（署名不一致など） | `400` | `{ "error": "Invalid signature" }` |
| イベントハンドラ内で例外発生 | `500` | `{ "error": "Webhook handler failed" }` |

### (4) 成功時に subscriptions テーブルへ書く内容

`upsertSubscription()` 関数が `user_id` をキーに UPSERT する。書き込まれるカラム:

| カラム | 値 |
|---|---|
| `user_id` | イベントの `metadata.userId` または `client_reference_id` |
| `stripe_subscription_id` | `subscription.id` |
| `stripe_customer_id` | `subscription.customer` |
| `stripe_price_id` | `subscription.items.data[0].price.id` |
| `plan` | `"pro"` / `"team"` / `"free"` (status が active/trialing 以外なら free) |
| `status` | Stripe の `subscription.status` そのまま |
| `trial_end` | `trial_end` が null でなければ ISO 文字列、null なら null |
| `current_period_end` | `item.current_period_end` を ISO 文字列に変換 |
| `cancel_at_period_end` | `subscription.cancel_at_period_end` |
| `updated_at` | `new Date().toISOString()` |

onConflict: `"user_id"` — ユーザーごとに 1 行のみ保持。

---

## Evidence

| 主張 | ソース |
|---|---|
| `STRIPE_WEBHOOK_SECRET` のみ使用 | `route.ts:51` |
| 署名なし → 400 | `route.ts:42-44` |
| 署名不一致 → 400 | `route.ts:53-56` |
| ハンドラ例外 → 500 | `route.ts:121-124` |
| UPSERT カラム一覧 | `route.ts:19-35` |
| `planFromPriceId()` が free/pro/team を返す | `lib/stripe.ts:14-16` |
| `onConflict: "user_id"` | `route.ts:34` |

---

## Assumptions & gaps

- `subscriptions` テーブルのスキーマ（カラム型・制約）はこのファイルからは確認不可。Supabase 側で `user_id` に UNIQUE 制約が必要（UPSERT が機能するため）。
- test/live の分離は **Vercel 環境変数の設定次第**。コード上は保証されていない。Preview 環境に誤って live webhook を向けるミスが起きうる。
- `invoice.payment_failed` で `invoice.parent?.subscription_details?.subscription` を参照しているコメントに「API version 2026-04-22.dahlia」と記載あり（`lib/stripe.ts:8` で確認済み）。古い Stripe API バージョンではフィールド名が異なる可能性がある。

---

## Implications

- **test/live 分離**: Vercel で `STRIPE_WEBHOOK_SECRET` を Preview/Production で別値に設定すれば問題ない。現状コードで対応可能。
- **cancellation email**: `customer.subscription.updated` で `cancel_at_period_end` が false→true に変わったときのみ `sendCancellationEmail()` を呼ぶ。即時キャンセル（`subscription.deleted`）では呼ばれない。
- **`userId` 取得の二重ロジック**: `checkout.session.completed` は `client_reference_id ?? metadata.userId` を参照。`updated`/`deleted` は `metadata.userId` のみ。`client_reference_id` が設定されていない checkout セッションでも `metadata.userId` がフォールバックとして機能する。
