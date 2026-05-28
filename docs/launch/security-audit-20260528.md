# SplanAI Security Audit 2026-05-28（ポストローンチ）

**監査日**: 2026-05-28  
**対象ブランチ**: `main` (commit `e21d4dc`)  
**実施者**: Claude Code (automated read-only scan)  
**前回監査**: `security-audit-20260521.md`  
**方針**: 調査専用。コード・.env・Stripe設定は変更なし。修正は所有者承認後に別途実施。

**修正実施 Round 1**: 2026-05-28 — H-1/H-2/H-3/M-6/M-7 を修正（要レビュー・要 Preview 検証）。build ✅  
**修正実施 Round 2**: 2026-05-28 — M-4（共有レート制限 Postgres 実装）・H-3 レート制限完成。build ✅  
**修正実施 Round 3**: 2026-05-28 — M-5（セキュリティヘッダ整備 + CSP-Report-Only 追加）。build ✅  
**修正実施 Round 4**: 2026-05-28 — Low-1/Low-2/Low-4（401 修正・管理メール env var 化・share/event レート制限）。build ✅

---

## サマリー

| 重大度 | 件数 | 修正必要 |
|--------|------|----------|
| Critical | 0 | — |
| High | 3 | 3 ✅ 修正済（要レビュー） |
| Medium | 4 | M-4/M-5/M-6/M-7 ✅ 全修正済（要レビュー） |
| Low / Info | 4 | Low-1/Low-2/Low-4 ✅ 修正済（要レビュー）/ Low-3(モジュロバイアス) 情報のみ |

**前回から継続していた課題**: CSP ヘッダ未設定 → Round 3 で `Content-Security-Policy-Report-Only` を実装済（Preview で違反確認後に enforce 版に切替予定）

---

## 1. 秘密情報の露出

### 結果: ✅ 良好

| 変数 | NEXT_PUBLIC_ 使用 | 判定 |
|------|-------------------|------|
| `SUPABASE_URL` | ✅ (Supabase 仕様上 public) | OK |
| `SUPABASE_ANON_KEY` | ✅ (RLS で保護) | OK |
| `SUPABASE_SERVICE_ROLE_KEY` | なし — server only | OK |
| `STRIPE_SECRET_KEY` | なし | OK |
| `STRIPE_WEBHOOK_SECRET` | なし | OK |
| `ANTHROPIC_API_KEY` | なし (SDK が `process.env.ANTHROPIC_API_KEY` を自動参照) | OK |
| `GOOGLE_MAPS_API_KEY` | なし — server only | OK |
| `RENTCAST_API_KEY` | なし — server only | OK |
| `AES_ENCRYPTION_KEY` | なし | OK |
| `CRON_SECRET` | なし — server only | OK |

- `.env*` は `.gitignore` で除外済。git 履歴にも .env ファイルのコミット記録なし（確認済）。
- `GOOGLE_MAPS_API_KEY` は `neighborhood/route.ts` (server) のみで参照。クライアントバンドルに混入なし。
- Anthropic SDK は `ANTHROPIC_API_KEY` を自動参照し `client = new Anthropic()` として初期化（`generate/route.ts:12`）。API キー文字列はコード上に出現しない。

**注**: 管理者メール `k10600460@gmail.com` がサーバー側コード 2 ファイルにハードコード（後述 Low-2）。

---

## 2. 認証・認可

### H-1 【High → ✅ 修正済（要レビュー）】`/api/stripe/team-checkout` — 認証チェックなし

**根拠**: `src/app/api/stripe/team-checkout/route.ts:4-11`

```ts
export async function POST(req: NextRequest) {
  try {
    const { userId, email } = await req.json() as { userId?: string; email?: string };
    // ← getUser() 呼び出しなし。Supabase セッション不要。
```

`userId` と `email` をリクエストボディから受け取り、Stripe Checkout セッションを作成する。

**影響**:
1. 未認証の攻撃者が任意の `userId` を指定してチェックアウトセッションを作成できる。
2. セッション完了後、Stripe Webhook (`checkout.session.completed`) が `client_reference_id`（= 攻撃者指定の userId）を信頼し、`subscriptions` テーブルに team プランを upsert する (`webhook/route.ts:62-69`)。
3. 攻撃者が自分のカードで支払いを完了すれば、任意の userId に team プランを割り当てられる。
4. レート制限もなく、スパム Checkout セッション生成も可能。

**推奨修正**:
```ts
// POSTの冒頭に追加
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// userId, email は req.json() からではなく user.id, user.email を使う
```
加えて `/api/checkout` と同じく `checkRateLimit` を追加すること。

---

### H-2 【High → ✅ 修正済（要レビュー）】`/api/stripe/portal` — Stripe Customer の所有権確認なし

**根拠**: `src/app/api/stripe/portal/route.ts:13-22`

```ts
const { customerId } = await req.json();  // リクエストボディから取得
// ← customerId が認証ユーザーのものか確認しない
const session = await stripe.billingPortal.sessions.create({
  customer: customerId,
  return_url: `${appUrl}/dashboard`,
});
```

認証は要求するが (`getUser()` 呼び出しあり)、受け取った `customerId` が認証ユーザーのものかを検証しない。

**影響**: 認証済みの攻撃者が他ユーザーの Stripe Customer ID (`cus_xxx`) を知っていた場合、そのユーザーのビリング ポータル（支払い方法の変更、サブスクリプションのキャンセル等）にアクセスできる。Stripe Customer ID は推測困難だが、DB 漏洩・ログ漏洩・フロントエンドコードで露出した場合にリスクになる。

**推奨修正**:
```ts
// customerId を req.json() から受け取る代わりに、DBから取得して検証する
const { data: sub } = await supabaseAdmin
  .from("subscriptions")
  .select("stripe_customer_id")
  .eq("user_id", user.id)
  .maybeSingle();
if (!sub?.stripe_customer_id) {
  return NextResponse.json({ error: "No active subscription" }, { status: 404 });
}
const session = await stripe.billingPortal.sessions.create({
  customer: sub.stripe_customer_id, // DB 由来 = 所有権保証済み
  ...
});
```

---

### H-3 【High → ✅ 修正済（要レビュー）】`/api/generate-pdf` — 認証 + 共有レート制限追加済

**根拠**: `src/app/api/generate-pdf/route.ts:197-209`（認証 + 10 req/min/user の DB レート制限を追加）

PDF 生成は pdfmake による CPU/メモリ集約的な処理（`maxDuration = 15`）。認証不要・レート制限なしで誰でも叩ける。

**影響**:
1. 未認証の攻撃者が大量リクエストを送り、サーバーリソースを枯渇させられる。
2. `planData` 配列のサイズ・深さ検証がないため、巨大なペイロードで OOM を引き起こせる可能性がある（`language !== 'zh'` チェックのみ）。

**推奨修正**:
```ts
// 認証チェック追加
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// レート制限追加（例: 10回/時/IP）
const rl = checkRateLimit(`pdf:${getClientIp(req)}`, { max: 10, windowMs: 60 * 60 * 1000 });
if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

// planData サイズ検証追加
if (!Array.isArray(planData) || planData.length > 3) {
  return NextResponse.json({ error: "planData must be an array of ≤3 plans" }, { status: 400 });
}
```

---

### その他の認証結果: ✅

| エンドポイント | 認証 | 課金API保護 |
|----------------|------|-------------|
| `/api/generate` | ✅ getUser() + checkUsageLimit | ✅ Claude 課金 保護 |
| `/api/neighborhood` | ✅ getUser() | ✅ Google Maps / RentCast 保護 |
| `/api/usage` | ✅ getUser() | — |
| `/api/share/create` | ✅ getUser() | — |
| `/api/checkout` | ✅ getUser() | — |
| `/api/stripe/checkout` | ✅ getUser() | — |
| `/api/mls/*` | ✅ getUser() + plan check | ✅ Trestle 保護 |
| `/api/team/*` | ✅ getUser() | — |
| `/api/cron/*` | ✅ CRON_SECRET Bearer token | — |
| `/api/share/event` | 不要（公開ポータル） | — |

---

## 3. Supabase RLS

**未確認（コードからは判断不可）**: RLS ポリシーは Supabase Dashboard/マイグレーション SQL で定義されるため、コード解析では確認できない。

**コードから確認できた事実**:
- `SUPABASE_SERVICE_ROLE_KEY` の使用は全て API Route (server) または `lib/` 内サーバー専用ファイルのみ。Client Component からの import なし ✅
- `lib/supabase/client.ts` は anon key のみ使用 ✅
- Realtime 購読 (`DashboardClient.tsx:253-271`) は anon client を使用しており RLS が適用される ✅

**未確認として明記**:
- `link_events`, `shared_links`, `api_usage`, `subscriptions`, `team_members`, `mls_connections` 各テーブルの RLS 有効化・ポリシー内容は Supabase ダッシュボードで個別確認が必要。
- Realtime の RLS が正しく `shared_links.user_id = auth.uid()` でスコープされているかは Dashboard 上の設定次第。

---

## 4. 公開ポータル /s/[slug]

### 結果: 概ね良好 / 軽微な懸念あり

**スラグのエントロピー**: `randomBytes(8)` + 36 文字アルファベット → 約 **41.4 bits**（組み合わせ: 2.8 兆通り）。総当たりは現実的でない ✅

**軽微なバイアス**: `b % 36` は均一でない（256 mod 36 = 4 → 最初の 4 文字が若干高確率）。実用上の問題はないが、未確認として記録。

**露出データの確認** (`s/[slug]/page.tsx:16`):
```ts
.select('id, slug, plans, client_name, is_active, expires_at, view_count')
```
`plans`（AI生成 JSON）, `client_name`（任意文字列）, `view_count` のみ返却。ユーザーの PII・支払い情報・API キーは含まれない ✅

**IDOR**: スラグベースのアクセスであり数値 ID 連番でない。`is_active` チェックあり ✅

---

## 5. Realtime (link_events)

**コードから確認できた内容**:
- DashboardClient は anon client（RLS 適用）で購読
- クライアント側にもフィルタ条件なし（行レベルのフィルタなし）
- コメント: `// RLS ensures we only get events for own links` (`DashboardClient.tsx:252`)

**未確認**: Supabase Dashboard で `link_events` の RLS ポリシーが `shared_links.user_id = auth.uid()` を通じて正しくスコープされているか確認が必要。RLS が未設定・誤設定の場合、他ユーザーのリンクビューイベントが受信される。

---

## 6. レート制限・濫用対策

### M-4 【Medium → ✅ 修正済（要レビュー）】In-memory rate limiter → Postgres 共有実装に移行

**根拠**: `src/lib/security.ts`（インメモリ `checkRateLimit`・`rateLimitStore` を削除）  
**修正**: 2026-05-28 — `supabase/migrations/20260528_rate_limits.sql` + `src/lib/rate-limit-db.ts`

**実装内容**:
- Supabase に `rate_limits` テーブル（`key text, window_start timestamptz, count int`、複合 PK）
- `check_rate_limit(key, window_sec, limit)` Postgres RPC（`INSERT ... ON CONFLICT DO UPDATE` でアトミックインクリメント）
- RLS 有効 + `SECURITY DEFINER`、`EXECUTE` は service_role のみ
- `lib/rate-limit-db.ts` ヘルパー：RPC エラー時は fail-open（正規ユーザーを止めない）

**適用エンドポイントと閾値（識別子 = 認証後はユーザーID、pre-auth は IP）**:

| エンドポイント | 識別子 | 閾値 |
|----------------|--------|------|
| `/api/generate` | `generate:user:<uid>` | 10 req/60s |
| `/api/generate-pdf` | `pdf:user:<uid>` | 10 req/60s |
| `/api/neighborhood` | `neighborhood:user:<uid>` | 30 req/60s |
| `/api/share/create` | `share:user:<uid>` | 20 req/3600s |
| `/api/mls/lot-data` | `mls:user:<uid>` | 10 req/60s |
| `/api/checkout` | `checkout:ip:<ip>` | 5 req/900s |
| `/api/stripe/checkout` | `checkout:ip:<ip>` | 5 req/900s |
| `/api/stripe/team-checkout` | `checkout:ip:<ip>` | 5 req/900s |

**注**: signup レート制限は Supabase Auth 側の設定（Next.js ルートなし）のため対象外。

---

### その他のレート制限状況（Round 2 修正後）

| エンドポイント | レート制限 | 識別子 |
|----------------|-----------|--------|
| `/api/generate` | ✅ 10 req/60s (DB) | user ID |
| `/api/generate-pdf` | ✅ 10 req/60s (DB) | user ID |
| `/api/neighborhood` | ✅ 30 req/60s (DB) | user ID |
| `/api/share/create` | ✅ 20 req/h (DB) | user ID |
| `/api/mls/lot-data` | ✅ 10 req/60s (DB) | user ID |
| `/api/checkout` | ✅ 5 req/15min (DB) | IP |
| `/api/stripe/checkout` | ✅ 5 req/15min (DB) | IP |
| `/api/stripe/team-checkout` | ✅ 5 req/15min (DB) | IP |
| `/api/share/event` | ❌ なし（Low-4 参照） | — |
| サインアップ | Supabase Auth 組み込みのみ（カスタムなし） | — |

---

## 7. Stripe

### H-1, H-2 参照（team-checkout 未認証 / portal 所有権未検証）

### その他の Stripe セキュリティ: ✅ 良好

| チェック項目 | 結果 | 根拠 |
|------------|------|------|
| Webhook 署名検証 | ✅ | `webhook/route.ts:48-55` — `constructEvent()` 実装済 |
| userId はサーバー Session 由来 | ✅ | `checkout/route.ts:22` — `supabase.auth.getUser()` |
| priceId はサーバー env var 由来 | ✅ | `checkout/route.ts:28` — `STRIPE_PRICE_ID` |
| クライアントからの価格改ざん不可 | ✅ | クライアントは `plan` 文字列のみ送信 |
| `allow_promotion_codes: true` | ✅ | 3ルート全て確認済（前セッションで修正） |
| Trial 二重取り防止 | ✅ | 既存 sub 記録があれば `trialDays = 0` |
| Stripe customer ID の再利用 | ✅ | 既存 `stripe_customer_id` を DB から取得・検証 |

---

## 8. 入力検証・インジェクション

### 結果: 概ね良好

| リスク | 状態 | 根拠 |
|--------|------|------|
| プロンプトインジェクション (generate) | ✅ 対策済 | `validateGenerateInput()` — 数値型強制 + 範囲制限 |
| city/state インジェクション | ✅ 対策済 | regex `/^[a-zA-Z\s\-'.]{1,60}$/` |
| MLS listingId OData インジェクション | ✅ 対策済 | regex `/^[\w\-]+$/` |
| SQL インジェクション | ✅ 非該当 | Supabase SDK がパラメータ化クエリを自動適用 |
| XSS (SharePortalClient) | ✅ 問題なし | `dangerouslySetInnerHTML` の使用なし |
| XSS (DashboardClient) | ✅ 問題なし | 同上 |
| AI 生成テキストの XSS | ✅ 問題なし | React が JSX テキストを自動エスケープ |

### M-2 / M-6 【Medium → ✅ 修正済（要レビュー）】Stripe エラーメッセージのクライアント露出

**根拠**: `src/app/api/checkout/route.ts:85-89`

```ts
const stripeMsg = error instanceof Error ? error.message : String(error);
return NextResponse.json(
  { error: `Checkout failed: ${stripeMsg}` },  // ← raw Stripe メッセージ
  { status: 500 },
);
```

Stripe の内部エラーメッセージ（Price ID 設定ミス・API バージョン不一致等）がそのままクライアントに返される。同様の問題が `/api/stripe/checkout/route.ts` にも存在するが、そちらは `{ error: "Failed to create checkout session" }` として隠蔽されている（一貫性なし）。

**推奨修正**:
```ts
// checkout/route.ts:88 を変更
return NextResponse.json({ error: "Checkout session creation failed. Please try again." }, { status: 500 });
// stripeMsg はサーバーサイドログ（console.error）に残し、クライアントへは渡さない
```

---

### M-3 / M-7 【Medium → ✅ 修正済（要レビュー）】MLS connect エラーメッセージのクライアント露出

**根拠**: `src/app/api/mls/connect/route.ts:122`

```ts
return NextResponse.json({ error: msg }, { status: 500 });
```

`msg` は Trestle API の生レスポンスを含む可能性があり、内部エンドポイント構造・認証フローの詳細を漏洩しうる。

**推奨修正**: 汎用メッセージ `{ error: "MLS connection failed. Please check your credentials." }` を返す。詳細は `console.error` のみ。

---

## 9. 依存関係

### 結果: ✅ CVE ゼロ

```
npm audit: 0 vulnerabilities (542 packages)
```

前回修正の postcss override が有効。最新の Next.js 脆弱性（CVE-2025-55182 等）は Next.js 16.2.6 使用のため非該当。

---

## 10. 一般: セキュリティヘッダ / CORS / エラー

### 設定済ヘッダ ✅

`next.config.ts` で全ルートに適用済:

| Header | 値 |
|--------|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |

### M-5 【Medium → ✅ 修正済】Content-Security-Policy (CSP) ヘッダ — Report-Only 実装済

**根拠**: `next.config.ts` 全体確認済。CSP ヘッダなし → **Round 3 で修正**。

CSP がないと、XSS が成功した場合に任意スクリプトの実行・データ窃取が阻止できない。現在 XSS 脆弱点は発見されていないが、多層防御として CSP は重要。

**修正内容 (2026-05-28)**:
- `Content-Security-Policy-Report-Only` を `next.config.ts` 全ルートに追加
- 外部ソース調査結果:
  - Stripe Checkout: リダイレクト方式 (Stripe Elements iframe なし) → `frame-src` 追加不要
  - Google Maps: サーバーサイド API のみ → browser `connect-src` 追加不要
  - Google Fonts (Geist): `next/font/google` がビルド時にセルフホスト → `fonts.googleapis.com` 追加不要
  - Vercel Analytics: `va.vercel-scripts.com` (script-src) + `vitals.vercel-insights.com` (connect-src)
  - Supabase: REST + Realtime WebSocket (`wss://sabriblwzzsvxsfxoebe.supabase.co`)

**適用した CSP-Report-Only ディレクティブ**:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://sabriblwzzsvxsfxoebe.supabase.co
            wss://sabriblwzzsvxsfxoebe.supabase.co
            https://vitals.vercel-insights.com;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
```

注意点:
- `unsafe-inline` (script-src): Next.js が `__NEXT_DATA__` などのインラインスクリプトを注入するため必須。`nonce` 対応に切り替えると除去可能。
- `unsafe-inline` (style-src): React の `style={{...}}` prop がインライン style 属性を生成するため必須。
- HSTS: 本番環境のみに変更（`isProd` フラグで dev では送信しない）

**次のアクション**: Preview デプロイ後、ブラウザの開発者ツール（コンソール）で CSP 違反を確認。違反がなければ `Content-Security-Policy-Report-Only` → `Content-Security-Policy` に切替。

### CORS: ✅

Next.js API Routes は同一オリジンのみがデフォルト。明示的な `Access-Control-Allow-Origin: *` 設定なし。

### オープンリダイレクト: ✅ 問題なし（確認済）

`auth/callback/route.ts:55` の `NextResponse.redirect(`${origin}${next}`)` において `origin` は `new URL(request.url)` のオリジン部分（プロトコル + ホスト）、`next` は path のみ。`origin + "//evil.com"` = `https://splanai.com//evil.com` となり同一オリジンパスとして解釈されるため、クロスオリジンリダイレクトにはならない。

---

## Low / Info

### Low-1: ✅ 修正済 `/api/team/plan` — 未認証時に 200 → 401 に変更

**修正**: `src/app/api/team/plan/route.ts:8`

```diff
- if (!user) return NextResponse.json({ plan: "free", companyName: "" });
+ if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

---

### Low-2: ✅ 修正済 管理者メールアドレスのハードコード → env var フォールバック

**修正**: `src/app/api/cron/daily-brief/route.ts:5` + `src/lib/external-apis.ts:9`

```diff
# daily-brief/route.ts:5
- const ADMIN_EMAIL = "k10600460@gmail.com";
+ const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? "k10600460@gmail.com";

# external-apis.ts:9
- const ALERT_EMAIL = 'k10600460@gmail.com'
+ const ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? 'k10600460@gmail.com'
```

`.env` に `ADMIN_ALERT_EMAIL` を設定すれば上書き可能。未設定時はフォールバック動作。

---

### Low-3: スラグのモジュロバイアス

**根拠**: `src/app/api/share/create/route.ts:7-10`

`randomBytes(8)` の各バイト値 (0-255) を 36 文字アルファベットにマッピングする際、`b % 36` を使用。256 mod 36 = 4 であるため、最初の 4 文字 (a-d) が若干高頻度。エントロピーは 41.4 bits（2.8 兆通り）で実用上問題なし。

---

### Low-4: ✅ 修正済 `/api/share/event` — IP ベースレート制限追加

**修正**: `src/app/api/share/event/route.ts`

```diff
+ import { getClientIp } from '@/lib/security'
+ import { checkRateLimitDB } from '@/lib/rate-limit-db'
+
+ // 30 events/min per IP — generous for real users, blocks scripted flooding
+ const EVENT_RATE = { limit: 30, windowSec: 60 }
+
  export async function POST(req: NextRequest) {
+   const ip = getClientIp(req)
+   const rl = await checkRateLimitDB(`share_event:ip:${ip}`, EVENT_RATE)
+   if (!rl.allowed) {
+     return NextResponse.json(
+       { ok: false, reason: 'rate_limited' },
+       { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
+     )
+   }
+
    try {
```

---

## 現状で確認できた防御（強みの証拠）

| 防御機構 | 確認箇所 |
|----------|---------|
| 主要な課金 API（Claude, Google Maps, RentCast）は全て認証後のみアクセス可能 | generate, neighborhood, mls ルート |
| Stripe Webhook 署名検証 | `webhook/route.ts:48` |
| priceId・userId は全てサーバー側で解決（クライアント改ざん不可） | checkout, stripe/checkout |
| Trestle MLS クレデンシャルは AES-256-GCM で暗号化保存 | `crypto.ts`, `mls/connect` |
| プロンプトインジェクション対策（数値型強制 + 範囲制限） | `security.ts:validateGenerateInput()` |
| セキュリティヘッダ 6 種（X-Frame-Options, HSTS[本番のみ], X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP-Report-Only） | `next.config.ts` |
| CRON エンドポイント全 7 本で CRON_SECRET 確認 | cron/* ルート全確認 |
| IP ハッシュ化（raw IP は DB に保存しない） | `crypto.ts:hashIp()`, share/event |
| npm audit: 0 CVE | 実行確認済 |
| .env ファイルは .gitignore で除外 | `.gitignore:17` |

---

## 要修正の穴（優先順）

| # | 重大度 | 課題 | 対応ファイル |
|---|--------|------|-------------|
| 1 | ~~**High**~~ ✅ | `/api/stripe/team-checkout` 認証なし + userId 改ざん可能 | 修正済（要レビュー） |
| 2 | ~~**High**~~ ✅ | `/api/stripe/portal` Stripe Customer 所有権未検証 | 修正済（要レビュー） |
| 3 | ~~**High**~~ ✅ | `/api/generate-pdf` 認証なし | 修正済（要レビュー） |
| 4 | ~~**Medium**~~ ✅ | In-memory rate limiter → Postgres 共有実装に移行 | 修正済（`lib/rate-limit-db.ts`、migration `20260528_rate_limits.sql`） |
| 5 | ~~**Medium**~~ ✅ | CSP-Report-Only 実装済（違反確認後 enforce 版に切替予定） | `next.config.ts` |
| 6 | ~~**Medium**~~ ✅ | Stripe エラーメッセージがクライアントに露出 | 修正済（要レビュー） |
| 7 | ~~**Medium**~~ ✅ | MLS connect エラーメッセージがクライアントに露出 | 修正済（要レビュー） |
| 8 | ~~**Low**~~ ✅ | `/api/team/plan` — 未認証時 401 に修正 | 修正済（要レビュー） |
| 9 | ~~**Low**~~ ✅ | 管理者メール → `ADMIN_ALERT_EMAIL` env var フォールバック | 修正済（要レビュー） |
| 10 | ~~**Low**~~ ✅ | `/api/share/event` — IP ベースレート制限追加 (30/60s) | 修正済（要レビュー） |

---

_監査日: 2026-05-28 | ブランチ: main | Round 1: H-1/H-2/H-3/M-6/M-7 | Round 2: M-4 DB rate limiter | Round 3: M-5 CSP | Round 4: Low-1/Low-2/Low-4 | push はしていない_
