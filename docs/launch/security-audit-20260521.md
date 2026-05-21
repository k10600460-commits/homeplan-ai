# SplanAI Security Audit 2026-05-21（T-5）

**ブランチ**: `security/launch-hardening-20260521`
**監査日**: 2026-05-21
**実施者**: Claude Code (automated) + Shuraemon review

---

## サマリー

| 重要度 | 発見数 | 修正済 |
|--------|--------|--------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 3 | 3 ✅ |
| Low / Info | 2 | 1 ✅ / 1 → 人間タスク |

**修正コミット**: (このブランチで git commit 後に記載)
**PR URL**: (マージ後に記載)

---

## タスク 1: Stripe Webhook Signature Verification

### 現状: ✅ 全項目 OK

| チェック項目 | 結果 | 該当箇所 |
|------------|------|--------|
| `req.text()` で raw body 取得 | ✅ OK | `webhook/route.ts:39` |
| `stripe-signature` ヘッダ取得 | ✅ OK | `webhook/route.ts:40` |
| `constructEvent()` で検証 | ✅ OK | `webhook/route.ts:48` |
| 検証失敗時に 400 返却 | ✅ OK | `webhook/route.ts:55` |
| Event type whitelist (switch) | ✅ OK | `webhook/route.ts:59-119` |
| `STRIPE_WEBHOOK_SECRET` に NEXT_PUBLIC_ なし | ✅ OK | 環境変数名確認済 |

### 修正内容: なし

---

## タスク 2: Rate Limiting

### 現状 (修正前)

| Endpoint | 状態 |
|---------|------|
| `/api/generate` | ✅ 5 req/min/IP |
| `/api/mls/lot-data` | ✅ 5 req/min/IP |
| `/api/checkout` | ❌ 未実装 |
| `/api/share/create` | ❌ 未実装 |
| `/api/neighborhood` | ❌ 未実装 |

**追加の問題**: `checkRateLimit()` が `max=5` 固定で他 endpoint に流用できなかった。

### 修正内容: Medium → 修正済み ✅

1. **`src/lib/security.ts`**: `checkRateLimit(identifier, options?)` を追加し、`max` と `windowMs` をパラメータ化
2. **`/api/checkout`**: `5 req / 15min / IP` を追加
3. **`/api/share/create`**: `20 req / 1h / IP` を追加
4. **`/api/neighborhood`**: `30 req / 1min / IP` を追加

### 残課題

- **既存 limiter は in-memory (per-instance)**。Vercel serverless の複数インスタンスではインスタンスごとに独立してカウントされる。グローバル enforcement には Upstash Redis が必要（MRR $500 以上の Phase 1 到達後に実装推奨）。
- Vercel Dashboard での WAF rate limit 設定は `docs/launch/vercel-waf-checklist.md` を参照。

---

## タスク 3: AI API コスト爆発防止

### 現状: ✅ 既存実装で保護済み

| 保護機構 | 内容 | 状態 |
|--------|------|------|
| Claude API 月次リクエスト上限 | Free: 3, Pro: 100, Team: 100 | ✅ `checkUsageLimit()` |
| 上限超過で 429 返却 | `/api/generate` で確認 | ✅ |
| Google Maps 月次上限 | warn: 25K, stop: 28K + 自動メール | ✅ `external-apis.ts` |
| RentCast 月次上限 | warn: 45, stop: 50 + 自動メール | ✅ `external-apis.ts` |
| IP rate limit (/api/generate) | 5 req/min/IP | ✅ |
| Prompt injection 防止 | 入力値バリデーション + 数値型強制 | ✅ `validateGenerateInput()` |

### 残課題 (人間タスク)

- **Anthropic console での monthly spend limit 設定**: コードでは対応不可。推奨 $200/月。
  - URL: https://console.anthropic.com → API Keys → Edit → Monthly Spend Limit

---

## タスク 4: Dependency Audit

### 修正前

```
2 moderate severity vulnerabilities
postcss <8.5.10 — XSS via unescaped </style> (GHSA-qx2v-qp2m-jg93)
```

### CVE チェック

| CVE | 対象 | 当プロジェクト |
|-----|------|-------------|
| CVE-2025-55182 (Next.js RCE, CVSS 10.0) | Next.js ≤ 14.2.x | ✅ 非該当 (使用: 16.2.6) |
| CVE-2026-23864 (Next.js DoS) | Next.js ≤ 14.2.x | ✅ 非該当 (使用: 16.2.6) |

### 修正内容: Medium → 修正済み ✅

**`package.json` に `overrides` を追加**し postcss を `>=8.5.10` にピン留め:

```json
"overrides": {
  "postcss": ">=8.5.10"
}
```

`npm install` 後: **0 vulnerabilities**

ビルド・tsc・lint（修正ファイル対象）: 全パス ✅

---

## タスク 5: 環境変数 prefix 監査

### 現状: ✅ 問題なし

| 変数 | prefix | 判定 |
|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ✅ OK (Supabase anon client に必要) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ✅ OK (RLS で保護済み) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | ✅ OK (pk_ = 設計上公開) |
| `NEXT_PUBLIC_APP_URL` | public | ✅ OK (URL のみ) |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | public | ✅ OK (Mapbox 設計上公開) |
| `SUPABASE_SERVICE_ROLE_KEY` | なし | ✅ OK (サーバーサイドのみ) |
| `STRIPE_SECRET_KEY` | なし | ✅ OK |
| `STRIPE_WEBHOOK_SECRET` | なし | ✅ OK |
| `ANTHROPIC_API_KEY` | なし | ✅ OK |
| `RESEND_API_KEY` | なし | ✅ OK |
| `AES_ENCRYPTION_KEY` | なし | ✅ OK |

**Service Role Key の使用箇所**: 全て `route.ts` (API Route) または Server Component (no `'use client'`) のみ。Client Component からの import なし。

---

## タスク 6: HTTP Security Headers

### 修正前: ❌ 全項目未設定

### 修正内容: Medium → 修正済み ✅

**`next.config.ts`** に `headers()` セクションを追加:

| Header | 値 | 効果 |
|--------|---|------|
| `X-Frame-Options` | `DENY` | Clickjacking 防止 |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing 防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referer 情報漏洩防止 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS 強制 (2年) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` | 不要 API 無効化 |
| `X-DNS-Prefetch-Control` | `on` | パフォーマンス最適化 |

ビルド確認: ✅ 通過

---

## 残課題（人間タスク）

| # | タスク | 優先度 | 参照 |
|---|--------|--------|------|
| 1 | Vercel Dashboard で WAF/Firewall rules 設定 | 🔴 High | `docs/launch/vercel-waf-checklist.md` |
| 2 | Anthropic console で monthly spend limit 設定（推奨: $200/月） | 🔴 High | https://console.anthropic.com |
| 3 | Upstash Redis 導入でグローバル rate limit (MRR $500+ 後) | 🟡 Medium | Phase 1 以降 |
| 4 | CSP (Content-Security-Policy) ヘッダ追加 | 🟡 Medium | ローンチ後（mapbox/stripe iframe の精査が必要） |

---

_監査ブランチ: `security/launch-hardening-20260521`_
_ビルド: ✅ passing | tsc: ✅ clean | npm audit: ✅ 0 vulnerabilities_
