# SplanAI API コスト全体像 監査レポート

**実施日**: 2026-05-24  
**調査範囲**: `src/` 全体 + `package.json` + `vercel.json`  
**方針**: 調査・記録のみ。コード変更なし。

---

## 結論（TL;DR）

| 質問 | 結論 |
|------|------|
| 間取り生成は Anthropic API を消費するか | **Yes — 毎回1回 Claude API を呼ぶ** |
| テストで消費が観測されなかった理由 | 1回あたりのコストが数セントと小さく、かつ Free プランの上限(3回)到達後は API 未到達のため |
| ローンチ時に実際にリスクある有料 API | Anthropic Claude（主リスク）・Google Maps（無料枠内）・RentCast（50件/月で十分） |
| OI-005（Anthropic spend limit）は必要か | **Yes — 必要。毎回の生成が API を消費する** |

---

## 1. 外部 API 一覧と呼び出し箇所

| サービス | 用途 | 呼び出しファイル | 従量/固定 |
|---------|------|----------------|---------|
| **Anthropic Claude** | 間取り3プラン生成 | `src/app/api/generate/route.ts:11,79` | 従量（リクエスト/トークン数） |
| **Google Maps Geocoding** | 緯度経度取得・ZIP コード取得 | `src/app/api/neighborhood/route.ts:49-77` | 従量 |
| **Google Maps Places Nearby** | 学校・病院・スーパー・警察・消防署検索 | `src/app/api/neighborhood/route.ts:80-93` | 従量 |
| **RentCast** | 家賃・売却市場データ取得 | `src/app/api/neighborhood/route.ts:192-218` | 従量（月50件上限） |
| **Trestle MLS** | 土地リスティング情報（Pro/Team のみ） | `src/app/api/mls/lot-data/route.ts` | ユーザー独自キー（SplanAI 負担なし） |
| **Resend** | トランザクションメール全般 | `src/lib/emails.ts`, `src/lib/external-apis.ts` | 従量（月3,000通まで無料） |
| **Stripe** | 決済処理 | `src/app/api/stripe/` | 取引手数料（直接 API コストなし） |
| **Supabase** | Auth + DB | `src/lib/supabase/` 全体 | プラン固定（現在 Free） |

---

## 2. 「AI 間取り生成」機能の実体

**判定: (a) LLM API 呼び出し（Anthropic Claude）**

### コードパス（file:line）

```
ユーザー → GET /dashboard → "Generate Plans" ボタン
→ POST /api/generate                                  ← route.ts:1
  ├─ 5 req/min IP レート制限 (security.ts)            route.ts:55
  ├─ Supabase getUser() 認証チェック                   route.ts:62
  ├─ checkUsageLimit() (Free:3回/Pro:100回/月)         route.ts:67 / usage.ts:68
  ├─ validateGenerateInput() 入力サニタイズ             route.ts:82
  └─ client.messages.create()                          route.ts:89
       model: "claude-sonnet-4-6"
       max_tokens: 4096
       system: SYSTEM_PROMPT (cache_control: ephemeral)
       → JSON: 3プラン（name/style/sqft/bedrooms/bathrooms/rooms/features）
  └─ recordApiUsage() — api_usage テーブルへ記録       route.ts:110
  └─ sendFirstPlanFollowupEmail() (初回のみ)           route.ts:115
```

**Anthropic SDK の初期化**:

```ts
// src/app/api/generate/route.ts:11
const client = new Anthropic();
// → ANTHROPIC_API_KEY 環境変数を自動使用（引数なし）
```

**システムプロンプトのキャッシュ**:

```ts
// route.ts:91-96
system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]
```

同一デプロイインスタンスへの連続リクエスト（5分以内）はシステムプロンプト(約500トークン)がキャッシュされ、キャッシュ読み取りコスト（通常の10%）に下がる。

---

## 3. Anthropic API 使用状況

### 使用箇所

| ファイル | 状態 | 内容 |
|---------|------|------|
| `src/app/api/generate/route.ts` | **実装済み・本番稼働中** | 1リクエストにつき1回 claude-sonnet-4-6 を呼ぶ |
| `src/app/api/cron/sales-dm-draft/route.ts` | スケルトン（未実装） | Week 1 post-launch で実装予定。現在は DB 接続確認のみ |
| `src/app/api/cron/seo-draft/route.ts` | スケルトン（未実装） | 同上 |
| `src/app/api/cron/finance-snapshot/route.ts` | スケルトン（未実装） | 同上 |

### 1回の生成あたりコスト概算

| トークン種別 | 概算量 | 単価（claude-sonnet-4-6） | コスト |
|------------|-------|--------------------------|--------|
| システムプロンプト（初回キャッシュ書き込み） | ~550 tokens | $3.75/M | $0.0021 |
| システムプロンプト（キャッシュ読み込み） | ~550 tokens | $0.30/M | $0.00017 |
| ユーザー入力 | ~60 tokens | $3.00/M | $0.00018 |
| 出力（3プランJSON） | ~2,000–3,500 tokens | $15.00/M | $0.030–0.053 |
| **合計（初回）** | — | — | **≈ $0.035** |
| **合計（キャッシュヒット）** | — | — | **≈ $0.032** |

月100回生成（Proプラン1ユーザー）= 約 $3.2–3.5/ユーザー/月

---

## 4. テストで Anthropic 消費が観測されなかった理由

以下のいずれかまたは複数が原因と推定される:

1. **Free プラン上限(3回)到達後のテスト**: `checkUsageLimit()` が LIMIT_EXCEEDED を返すため、`client.messages.create()` に到達しない。API キーは消費されない。
2. **コスト絶対値が小さい**: 1回≈$0.03。3〜5回テストしても$0.10–0.15 程度。Anthropic コンソールのデイリー表示で見落とした可能性。
3. **キャッシュ効果**: システムプロンプトのキャッシュが効いて入力トークンコストが10%になり、さらに目立ちにくい。

---

## 5. 課金・従量ポイント詳細

### Google Maps Platform（1近隣情報ルックアップあたり）

| API | 呼び出し回数 | メモ |
|-----|------------|------|
| Geocoding API（forward） | 1回 | city + state → 緯度経度 |
| Geocoding API（reverse） | 0〜1回 | ZIP コード取得できない場合のみ |
| Places Nearby Search | 5回 | school / hospital / grocery / police / fire_station |
| **合計** | **6〜7回/ルックアップ** | |

**自動上限制御** (`src/lib/external-apis.ts:11-14`):
- warn: 25,000 req/月 → Resend でアラートメール
- stop: 28,000 req/月 → 以降のルックアップを自動ブロック

Google Maps の無料枠 $200/月 ≈ Geocoding 40,000 req + Places Nearby 4,000 req。
現在の設定(stop=28,000)は安全圏内。

### RentCast（1近隣情報ルックアップあたり）

| API | 呼び出し回数 | メモ |
|-----|------------|------|
| Markets endpoint | 1回 | 市場データ取得 |

**自動上限制御** (`external-apis.ts`):
- warn: 45 req/月
- stop: 50 req/月

RentCast Free プランは 50 リクエスト/月。上限設計と一致している。

### api_usage_external テーブルのスキーマと書き込み箇所

`src/lib/external-apis.ts` が管理する:

```
api_usage_external
  service        : 'google_maps' | 'rentcast'
  month          : 'YYYY-MM'
  request_count  : 累積カウント（RPC: increment_external_usage で原子加算）
  stopped        : boolean（上限到達後 true、以降のAPIコールをブロック）
  warning_sent   : boolean（警告送信済みフラグ）
```

書き込み: `recordExternalUsage('google_maps')` / `recordExternalUsage('rentcast')` を `/api/neighborhood/route.ts` から呼び出し。

---

## 6. api_usage テーブル（Anthropic 使用量記録）

`src/lib/usage.ts` が管理する:

```
api_usage
  user_id            : UUID
  month              : 'YYYY-MM'
  request_count      : 累積リクエスト数（上限チェックに使用）
  token_count        : input + output tokens 合計
  estimated_cost_usd : (input/1M × $3.0) + (output/1M × $15.0)
```

書き込み: `recordApiUsage()` を `src/app/api/generate/route.ts:110` から呼び出し（非同期・non-blocking）。

**注記 (OI-007)**: `plan_generations` テーブルへの INSERT が未配線。Daily Brief の「生成数」が常に0表示になる原因はこれ。`api_usage` テーブルへの記録は正常動作中。

---

## 7. 環境変数 対応表

| 環境変数 | サービス | サーバー/クライアント | 用途 |
|---------|---------|-------------------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude | Server only | `new Anthropic()` が暗黙使用 |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform | Server only | Geocoding + Places Nearby |
| `RENTCAST_API_KEY` | RentCast | Server only | Markets API |
| `AES_ENCRYPTION_KEY` | 内部（暗号化） | Server only | Trestle MLS 認証情報の暗号化/復号 |
| `RESEND_API_KEY` | Resend | Server only | トランザクションメール送信 |
| `STRIPE_SECRET_KEY` | Stripe | Server only | 決済・Webhook 処理 |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Server only | Webhook 署名検証 |
| `STRIPE_PRICE_ID` | Stripe | Server only | Pro プラン price ID |
| `STRIPE_TEAM_PRICE_ID` | Stripe | Server only | Team プラン price ID |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | Client + Server | （現在 src/ 未使用 — dead env） |
| `CRON_SECRET` | Vercel Cron | Server only | cron ルート認証 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Client + Server | DB URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Client + Server | 匿名キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Server only | 管理者キー |
| `NEXT_PUBLIC_APP_URL` | 内部 | Client + Server | リダイレクト URL 生成 |

---

## 8. OI-005（Anthropic spend limit）の正しいスコープ

### 結論: 必要。設定すべき。

**根拠**:
- ユーザーが「Generate Plans」を押すたびに claude-sonnet-4-6 が1回呼ばれる（`route.ts:89`）。
- Free プランは月3回まで。Pro/Team は月100回まで（`usage.ts:9-12`）。
- Pro ユーザーが100回/月 ≒ $3.5/ユーザー。Phase 0 の数ユーザー規模では問題ないが、想定外のトラフィック・バグでレート制限を突破された場合のリスクがある。
- cron jobs（sales-dm-draft / seo-draft）が Week 1 post-launch に Anthropic を呼ぶ予定。合算すると支出が増える。
- $200/月 ≒ 約 5,700 生成分の余裕。Phase 0 では十分。

**設定先**: `console.anthropic.com` → API Keys → Edit → Monthly Spend Limit を $200 に設定。

---

## 9. ローンチ時のコスト/枯渇リスクまとめ

| サービス | リスクレベル | 状況 | 推奨アクション |
|---------|-----------|------|--------------|
| **Anthropic Claude** | 🔴 要対応 | 毎生成で消費。上限設定なし | OI-005: $200/月 spend limit を設定 |
| **Google Maps** | 🟡 低 | 自動 stop 28,000件設定済み。無料枠$200/月内 | 現状で十分。監視継続 |
| **RentCast** | 🟡 低 | 50件/月の自動 stop 設定済み | 現状で十分 |
| **Resend** | 🟢 問題なし | 無料3,000通/月。Phase 0 では超過しない見込み | 不要 |
| **Trestle MLS** | 🟢 問題なし | ユーザー独自キー。SplanAI 負担なし | 不要 |
| **Stripe** | 🟢 問題なし | 取引手数料のみ | 不要 |
| **Supabase** | 🟢 問題なし | Free プラン内。MRR $500+ でアップグレード判断 | Phase 1 で検討 |

---

## 参照

- `src/app/api/generate/route.ts` — メイン生成エンドポイント
- `src/app/api/neighborhood/route.ts` — Google Maps + RentCast 呼び出し
- `src/lib/usage.ts` — api_usage テーブル・プラン上限管理
- `src/lib/external-apis.ts` — api_usage_external テーブル・外部 API 上限管理
- `obsidian-vault/splanai-handover/_open-issues.md` — OI-005 OI-007
