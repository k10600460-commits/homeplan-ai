# 製品クレーム事実確認（営業/資料用）

**Date:** 2026-05-28  
**Question:** 営業文面と資料に載せる製品クレームの事実確認（plans設定・生成数/時間・MLS・ホワイトラベル・50州対応）

---

## Answer — サマリー表

| クレーム | ステータス | 安全な言い回し |
|---|---|---|
| Free 3回/月・Pro 100回/月 $49・Team 実質無制限 $149 | **shipped** | そのまま使用可 |
| 14日間トライアル（カード必要） | **shipped** | "14-day free trial, credit card required" |
| 1回の生成で間取り3案 | **shipped** | "3 floor-plan proposals per generation" |
| 生成時間 ~30秒 | **unverified** | "floor plans in about 30 seconds"は使わない。代わりに "in under a minute" 程度が無難 |
| Trestle MLS 連携 end-to-end | **shipped** | "MLS data via Trestle (Pro & Team)" — Pro専用ではなくPro/Team両方 |
| ホワイトラベル（Team） | **planned** | "White-label PDF" は使わない。"logo-branded PDF" も未実装。要実装後に解禁 |
| 全50州対応 | **shipped** | "Works in all 50 US states" そのまま使用可 |

---

## Evidence

### 1. プラン設定

**ソース:** `src/lib/usage.ts` L10–12 / `src/lib/stripe.ts` L11–12, 19 / `src/app/api/stripe/checkout/route.ts` L46, 62 / `src/app/api/stripe/team-checkout/route.ts` L50, 62

| プラン | 上限 | 価格 | トライアル | カード |
|---|---|---|---|---|
| Free | 3回/月 | $0 | なし | 不要 |
| Pro | 100回/月 | $49/月（ラベル） | 14日 | **必要** (`payment_method_collection: "always"`) |
| Team | 9999回/月（実質無制限） | $149/月（ラベル） | 14日 | **必要** |

- 価格はコード上はラベル文字列。実際の課金額は `STRIPE_PRICE_ID` / `STRIPE_TEAM_PRICE_ID` 環境変数で決まる。
- 再トライアル防止: `const trialDays = sub ? 0 : TRIAL_PERIOD_DAYS` — 既存サブスクがある場合はトライアルなし。

---

### 2. 間取り生成数・時間

**ソース:** `src/app/api/generate/route.ts` L54, L133–134

- **生成数:** `"Generate exactly 3 plans"` とプロンプトに明記、レスポンスが3案でなければ例外スロー。常に3案。
- **タイムアウト設定:** `/api/generate` に `maxDuration` 宣言なし（`/api/generate-pdf` には `maxDuration = 15` あり）。
- **"30秒"の根拠:** コード上に記載なし。Claude Sonnet 4.6 / max_tokens 4096 の実測値は未測定。
- **バッファリング:** レスポンスはストリーミングなし。フル生成後に一括返却。

---

### 3. MLS / Trestle 連携

**ソース:** `src/app/api/mls/lot-data/route.ts` L43–48, L127–149, L151–160 / `src/app/api/mls/connect/route.ts` L43–49

- **実装状態:** スタブではなく end-to-end 実装済み。Trestle RESO OData API へのトークン取得・リフレッシュ・実リクエストが動作。
- **プランゲート:** Free → 403。Pro・Team は許可。（"Pro専用" ではなく "Pro以上"）
- **IDX コンプライアンス:** オプトアウト物件はコードレベルでブロック（L181–187）。
- **監査ログ:** 全呼び出しを `mls_audit_logs` に記録。

---

### 4. ホワイトラベル（Team）

**ソース:** `src/lib/zh-pdf-html.ts` L62 / `src/app/api/generate-pdf/route.ts` L131–159 / `src/app/s/[slug]/SharePortalClient.tsx` L286, L383–384

- **PDFフッター:** `"Powered by SplanAI · Data: Google Maps + RentCast · splanai.com"` ハードコード。チーム設定による差し替えなし。
- **シェアポータルヘッダー:** `"SplanAI"` ハードコード。カスタムロゴ・カラー・ドメインの仕組みなし。
- **`clientName` フィールド:** DBに存在し表示される（"Prepared for: [名前]"）が、これはホワイトラベルではない。
- **結論:** ホワイトラベルは **未実装**。

---

### 5. 全50州対応

**ソース:** `src/app/api/generate/route.ts` / `src/app/api/neighborhood/route.ts` L128 / `src/middleware.ts` / `src/lib/external-apis.ts` L11–14

- 州の allowlist/blocklist は**コード上存在しない**。
- Neighborhood API は任意の `city, state, USA` を受け付ける（正規表現 `^[a-zA-Z\s]{1,30}$` のみ）。
- ジオブロッキングなし。Google Maps 側の実カバレッジは API 依存だがコードは制限しない。
- 生成系プロンプトは "United States" のコンテキストを与えているが特定州を排除しない。

---

## Assumptions & Gaps

- 価格（$49 / $149）はコード上の表示ラベルとして確認。実際の Stripe 課金レートは ENV の price ID に依存 — Stripe ダッシュボードで一致を別途確認推奨。
- 生成時間の実測値なし。"30秒" は未検証。Claude API のレイテンシはリクエスト長・混雑状況に依存。
- RentCast は月45リクエスト上限（コード上は `MONTHLY_LIMIT = 45`）で主要メトロのみ対応 — 全国対応はあくまで **生成と地図データ** の話。

## Implications

- **ホワイトラベルは即実装が必要**: Team $149/月 の差別化要素として訴求できない現状。実装前に営業資料で "白ラベルPDF" を約束しない。
- **生成時間は実測してから**: 計測後に "typically under X seconds" の形で明記する。
- **MLS は "Pro & Team" と記載**: "Pro専用" はコードと不一致。
