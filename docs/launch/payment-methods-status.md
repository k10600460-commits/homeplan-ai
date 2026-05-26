# Payment Methods — Status Report

**実施日**: 2026-05-21 | **ブランチ**: `feat/expand-payment-methods-20260521`

---

## 変更内容

### コード変更（3ファイル）

Stripe API v`2026-04-22.dahlia` 以降、`payment_method_types` を省略すると Stripe Dashboard の
設定を自動的に反映する仕様になっている。`automatic_payment_methods: { enabled: true }` は
旧 API バージョン向けの明示設定であり、新 API では型定義にも存在しない。

| ファイル | 変更前 | 変更後 |
|---------|--------|--------|
| `src/app/api/checkout/route.ts` | `payment_method_types: ["card"]` | (削除) |
| `src/app/api/stripe/checkout/route.ts` | `payment_method_types: ["card"]` | (削除) |
| `src/app/api/stripe/team-checkout/route.ts` | `payment_method_types: ["card"]` | (削除) |

`payment_method_collection: "always"` は維持（14日トライアル中もカード登録必須）。

### Apple Pay domain verification 用パス

`public/.well-known/` ディレクトリを作成済み。
Stripe Dashboard からダウンロードしたファイルをここに配置：

```
public/.well-known/apple-developer-merchantid-domain-association
```

---

## Shoji が朝確認するチェックリスト

### Stripe Dashboard — Payment Methods 有効化

URL: https://dashboard.stripe.com/settings/payment_methods

- [x] ~~**PayPal** を Activate~~ — **採用しない（DEC-008 確定 / 2026-05-22）**
  - Stripe 経由の PayPal は EU 系アカウント限定。日本拠点・US 法人設立後も対象外。
  - 将来の拡張候補は ACH（US Bank Account）。PayPal ではない。
- [ ] **Apple Pay** を Activate（OI-002 完了後）
  - Domain verification が必要（下記手順）
- [x] **Google Pay** — Dashboard 設定で有効化済み（Domain verification 不要・自動有効化）
- [x] **Link by Stripe** — Dashboard 設定で有効化済み（リピーター向け1クリック決済）
- [ ] (optional) **US Bank Account (ACH)** — Team plan 向け・post-launch 検討

### Apple Pay Domain Verification 手順

1. Stripe Dashboard → Settings → Payment methods → Apple Pay
2. "Add new domain" で `splanai.com` を追加
3. ダウンロードリンクから `apple-developer-merchantid-domain-association` を取得
4. このファイルを `public/.well-known/` に配置してコミット
5. Vercel にデプロイ後、Stripe Dashboard で "Verify" を実行

> ⚠️ ファイルは `.well-known/` フォルダに**拡張子なし**で配置すること

---

## テストケース（test mode で確認）

- [ ] Pro $49 サブスク開始（Card `4242 4242 4242 4242`）
- [ ] Webhook `customer.subscription.created` → Supabase `subscriptions` テーブル反映
- [ ] Trial 期間 14 日が正しい
- [ ] Team $149 サブスク開始（Card）
- [ ] 既存ユーザーの再 subscribe フローが壊れていない

---

## 技術メモ

**なぜ `payment_method_types` を削除するだけで OK か？**

Stripe API `2023-10-16` 以降（本プロジェクトは `2026-04-22.dahlia`）：
- `payment_method_types` を省略 → Dashboard で有効化した全方法を自動表示
- `payment_method_types` を明示 → その方法のみに限定（上書き）
- `payment_method_configuration` → 事前設定した Configuration を参照

`payment_method_collection: "always"` を使う subscription mode では、
PayPal / Apple Pay / Google Pay いずれも対応済み。

---

_作成: 2026-05-21 | feat/expand-payment-methods-20260521_
