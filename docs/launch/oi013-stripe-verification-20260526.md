# OI-013 / 問い合わせメール / Stripe price ID 確認レポート

**調査日**: 2026-05-26  
**方針**: コード・設定ファイルから確認できる事実のみ記録。推測は「未確認」と明記。  
**コード変更**: なし（調査・ドキュメントのみ）

---

## 1. OI-013 の正確な内容

| 項目 | 内容 |
|------|------|
| **タイトル** | `splanai@gmail.com` 作成 |
| **内容** | 管理用 Gmail アカウントの作成 |
| **優先度** | 🟡 ローンチ前推奨（必須ではない） |
| **現在のステータス** | 未着手 |
| **関連ファイル** | なし（手動タスク・コード影響なし） |
| **完了条件** | Google で `splanai@gmail.com` アカウントを作成するだけ |

**補足**: OI-013 はコード変更を伴わない純粋な手動タスク。Gmail 作成後にコード修正は不要。

---

## 2. 問い合わせアドレス — コード上の実態

### 2-1. サイト全体で実際に使われているアドレス

| 場所 | アドレス | 用途 |
|------|---------|------|
| `src/app/page.tsx:1053-1054` | `hello@splanai.com` | LP フッター「Questions? hello@splanai.com」リンク |
| `src/app/privacy/page.tsx:11` | `hello@splanai.com` | `CONTACT_EMAIL` 定数 → プライバシーポリシー本文・リンク（3箇所） |
| `src/app/terms/page.tsx:11` | `hello@splanai.com` | `CONTACT_EMAIL` 定数 → 利用規約本文・リンク（2箇所） |

**結論**: サイト全体で問い合わせ先として公開されているのは `hello@splanai.com` のみ。  
`splanai@gmail.com` はコード内に一切登場しない。

### 2-2. `splanai@gmail.com` / `hellosplanai@gmail.com` の用途

| アドレス | コード上の記載 | 補足 |
|----------|--------------|------|
| `splanai@gmail.com` | **未登場** | OI-013 で作成予定だが現在未作成・未使用 |
| `hellosplanai@gmail.com` | `_open-issues.md` のみ（コード外） | テスト用サインアップ・問い合わせ受付用アカウント（OI-017 で存続予定） |

### 2-3. メール送信設定（Resend）

| 設定項目 | 値 | 備考 |
|---------|-----|------|
| FROM | `SplanAI <noreply@splanai.com>` | `emails.ts:4` — 全メール共通 |
| Reply-To | **未設定** | `emails.ts` の全 `resend.emails.send()` 呼び出しに `replyTo` フィールドなし |
| 送信対象メール | welcome / trial reminder / first-plan followup / cancellation / team invite | 5 種類 |

**重要**: `reply-to` が設定されていないため、ユーザーが受信メールに返信しても `noreply@splanai.com` 宛に送信される。返信は届かない（noreply のため）。

問い合わせ導線としては LP・Terms・Privacy の `hello@splanai.com` リンクが唯一の経路。

### 2-4. `hello@splanai.com` の転送設定について

**未確認**（コードから検証不可）。

`hello@splanai.com` が `splanai@gmail.com` や `hellosplanai@gmail.com` 等へ転送されているかは、メールサーバー（Resend ダッシュボード or DNS レベルの catch-all 転送設定）を直接確認しないと判定不能。実地テスト（`hello@splanai.com` 宛にメールを送り、どこかに届くか確認）が必要。

---

## 3. Stripe price ID の実態

### 3-1. `planFromPriceId` 関数

**ファイル**: `src/lib/stripe.ts:14-15`

```ts
export const STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID!;
export const STRIPE_TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID!;

export function planFromPriceId(priceId: string): "pro" | "team" {
  return priceId === STRIPE_TEAM_PRICE_ID ? "team" : "pro";
}
```

**判定ロジック**:
- `priceId === STRIPE_TEAM_PRICE_ID` → `"team"`
- それ以外すべて → `"pro"`（フォールバック）

→ **price ID 値はすべて環境変数から取得**。コード内にハードコードされた `price_...` 文字列はない。

### 3-2. 使用箇所

| ファイル | 用途 |
|---------|------|
| `src/lib/stripe.ts:11-12` | エクスポート定義 |
| `src/app/api/stripe/checkout/route.ts:56` | Pro checkout の price ID として使用 |
| `src/app/api/stripe/team-checkout/route.ts:21` | Team checkout の price ID として使用 |
| `src/app/api/checkout/route.ts:28` | plan に応じて Pro/Team を切り替え |
| `src/app/api/stripe/webhook/route.ts:17,89` | webhook 受信時に plan を判定 |

### 3-3. 環境変数の値

| 環境 | 変数名 | 値 | 備考 |
|------|-------|-----|------|
| **ローカル開発** (`.env.local`) | `STRIPE_PRICE_ID` | `price_1TWcWALkAvs6yXjwyHQcXYsW` | **テストモード**（`sk_test_` キー環境） |
| **ローカル開発** (`.env.local`) | `STRIPE_TEAM_PRICE_ID` | `price_1TYuUdLkAvs6yXjww6YmFFsK` | **テストモード**（同上） |
| **本番 (Vercel)** | `STRIPE_PRICE_ID` | **未確認** | Vercel Dashboard の環境変数を確認要 |
| **本番 (Vercel)** | `STRIPE_TEAM_PRICE_ID` | **未確認** | Vercel Dashboard の環境変数を確認要 |

> `.env.local` の Stripe キーは `pk_test_` / `sk_test_` 始まりのテストキー。
> ローカルの price ID はテスト環境のものであり、本番 Live モードの price ID とは別物。
> **本番の price ID は Vercel Dashboard → Environment Variables で確認するか、
> Stripe Dashboard → Live モード → Products で確認が必要（コードからは見えない）。**

### 3-4. C-02 検証状況（session-checkpoint-20260524.md より）

session-checkpoint-20260524.md の「C-02: Stripe Dashboard で Team プランの price が $149/月か確認」は **未確認のまま**。本番 Vercel の `STRIPE_TEAM_PRICE_ID` が正しい Live price ID を指しているかは手動確認が必要。

---

## 4. まとめ — アクション必要事項

| # | 項目 | アクション | 担当 |
|---|------|----------|------|
| A | OI-013 splanai@gmail.com 作成 | Gmail で `splanai@gmail.com` アカウント作成 | 手動 |
| B | `hello@splanai.com` 転送確認 | `hello@splanai.com` 宛にメール送信して届くか確認 | 手動テスト |
| C | `emails.ts` の reply-to | 問い合わせ受付を改善したいなら `hello@splanai.com` を reply-to に追加（post-launch 対応推奨） | 任意 |
| D | 本番 Team price ID 確認 (C-02) | Vercel env または Stripe Dashboard → Live → Products で確認 | 手動 |

---

## 参照

| ファイル | 関連内容 |
|---------|---------|
| `src/lib/stripe.ts` | `planFromPriceId`・`STRIPE_PRICE_ID`・`STRIPE_TEAM_PRICE_ID` 定義 |
| `src/lib/emails.ts` | FROM アドレス・reply-to 未設定の確認 |
| `src/app/page.tsx:1053-1054` | LP フッターの `hello@splanai.com` リンク |
| `src/app/terms/page.tsx:11` | CONTACT_EMAIL 定義 |
| `src/app/privacy/page.tsx:11` | CONTACT_EMAIL 定義 |
| `obsidian-vault/splanai-handover/_open-issues.md` | OI-013 原文 |
| `docs/launch/session-checkpoint-20260524.md` | C-02 検証未了の記録 |
