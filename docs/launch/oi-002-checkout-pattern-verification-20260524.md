# OI-002 決済フロー実装パターン確認レポート

**実施日**: 2026-05-24  
**目的**: Apple Pay 用の payment method domain 登録（splanai.com）が必要だったかを確定する  
**結論**: **パターン A（Stripe Checkout ホスト型）。splanai.com のドメイン登録は不要。**

---

## 確認ファイル一覧

| ファイル | 確認内容 |
|---------|---------|
| `src/app/api/checkout/route.ts` | Stripe API 呼び出しパターン |
| `src/app/api/stripe/checkout/route.ts` | Stripe API 呼び出しパターン（Pro プラン） |
| `src/app/api/stripe/team-checkout/route.ts` | Stripe API 呼び出しパターン（Team プラン） |
| `src/app/api/stripe/portal/route.ts` | Billing Portal（決済フローではない） |
| `src/app/api/stripe/webhook/route.ts` | Webhook 受信（決済フローではない） |
| `src/app/dashboard/DashboardClient.tsx` | フロントエンドの決済導線 |
| `src/app/upgrade/page.tsx` | フロントエンドの決済導線 |
| `src/app/page.tsx` | LP の決済導線 |
| `package.json` | Stripe 関連依存パッケージ |
| `src/**` 全体 | Elements / ウォレット UI の使用箇所検索 |

---

## 根拠（file:line + 該当コード）

### API ルート — 全3ルートが checkout.sessions.create + url 返却

**`src/app/api/checkout/route.ts:80-82`**
```ts
const session = await stripe.checkout.sessions.create(sessionParams);
return NextResponse.json({ url: session.url });
```

**`src/app/api/stripe/checkout/route.ts:73-74`**
```ts
const session = await stripe.checkout.sessions.create(sessionParams);
return NextResponse.json({ url: session.url });
```

**`src/app/api/stripe/team-checkout/route.ts:18,32`**
```ts
const session = await stripe.checkout.sessions.create({ ... });
return NextResponse.json({ url: session.url });
```

→ `paymentIntents` / `setupIntents` / `client_secret` の生成は**ゼロ件**。

---

### フロントエンド — 全導線が session.url へのリダイレクト

**`src/app/dashboard/DashboardClient.tsx:315-317`**（handleSubscribe）
```ts
const res = await fetch("/api/stripe/checkout", { method: "POST" });
// ...
if (data.url) window.location.href = data.url;
```

**`src/app/upgrade/page.tsx:30,36`**
```ts
const res = await fetch("/api/stripe/checkout", { method: "POST" });
if (data.url) window.location.href = data.url;
```

**`src/app/page.tsx:496,502`**（LP Team プラン）
```ts
const res = await fetch("/api/checkout", { ... });
if (data.url) { window.location.href = data.url; }
```

→ `window.location.href = data.url` で `checkout.stripe.com` へリダイレクト。  
　支払いは **checkout.stripe.com 上で完結**。

---

### ウォレット UI コンポーネント — src/ 全体で0件

| 検索文字列 | 結果 |
|-----------|------|
| `ExpressCheckoutElement` | 0件 |
| `PaymentRequestButton` / `paymentRequestButton` | 0件 |
| `PaymentElement` | 0件 |
| `<Elements` | 0件 |
| `loadStripe` | 0件 |
| `@stripe/react-stripe-js` | package.json に未インストール |

---

### package.json の Stripe 依存

```json
"@stripe/stripe-js": "^9.4.0",  // インストール済みだが src/ で import ゼロ（死んだ依存）
"stripe": "^22.1.1"              // サーバー側 API ルートのみで使用
```

`@stripe/react-stripe-js` は package.json に**存在しない**。

---

## A / B 判定

### **パターン A：Stripe Checkout（ホスト型リダイレクト）** ✅

1. API が `stripe.checkout.sessions.create()` で session を作成し `session.url` を返す
2. フロントは `window.location.href = data.url` で `checkout.stripe.com` へリダイレクト
3. Apple Pay / Google Pay 等のウォレット UI は **checkout.stripe.com 上で描画される**
4. splanai.com 上に Stripe Elements / ウォレット UI を描画するコードは**皆無**

---

## 結論

### Q1: splanai.com を payment method domain として登録する必要があったか？

**No — 不要だった。**

Stripe Checkout（ホスト型）では Apple Pay の処理が `checkout.stripe.com` 上で行われる。
Stripe は `checkout.stripe.com` を自動登録する。
`splanai.com` をドメイン登録しても支払いフローには何も変わらず、害もない（余分な登録）。

---

### Q2: OI-002（Apple Pay ドメイン認証）の扱い

**「完了扱いでよい（不要と確定）」**

- `public/.well-known/apple-developer-merchantid-domain-association` の配置は**不要**。
- Stripe Dashboard での "Verify" 操作も**不要**。
- 手動で splanai.com を登録済みでも動作に影響なし。
- `public/.well-known/` は `.gitkeep` のまま放置してよい。

---

### Q3: @stripe/stripe-js が package.json にある理由

インストールされているが src/ 全体で import がゼロ。  
将来 Elements 埋め込みに移行した際の準備か、過去の試験的実装の残滓と推定。  
現状は使用されていない（dead dependency）。post-launch で削除検討。

---

## 参照

- `docs/launch/apple-pay-domain-verification-20260524.md` — 前レポート（インフラ確認）  
- `obsidian-vault/splanai-handover/_open-issues.md` — OI-002 エントリ（本レポートで Resolved に更新）
