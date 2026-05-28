# Round 3 CSP / セキュリティヘッダ 検証レポート (2026-05-28)

**検証日**: 2026-05-28  
**対象**: M-5（セキュリティヘッダ整備 + CSP-Report-Only 追加）  
**検証方針**: コード・.env・git は変更しない。  
**参照**: `security-audit-20260528.md` (M-5)

---

## サマリー

| 項目 | 結果 |
|------|------|
| A. 静的検証 | ✅ PASS — 全ヘッダー確認済・HSTS 本番のみ・Report-Only 確認 |
| B. ビルド / 型 | ✅ PASS |
| C-1. ランタイム(dev) | ⚠️ eval 違反のみ — Next.js HMR 由来・本番では不発生 |
| C-2. ランタイム(prod) | ✅ PASS — CSP 違反 0 件 |

**結論**: 現在の allowlist で本番 enforce 版への切替が可能。

---

## A. 静的検証

### A-1: セキュリティヘッダ一覧 ✅ PASS

**ソース**: `next.config.ts` — `source: "/(.*)"` で全ルートに付与

| ヘッダー | 設定値 | 条件 | 結果 |
|---------|--------|------|------|
| `X-Frame-Options` | `DENY` | 全環境 | ✅ |
| `X-Content-Type-Options` | `nosniff` | 全環境 | ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 全環境 | ✅ |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | **本番のみ** (`isProd`) | ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), interest-cohort=()` | 全環境 | ✅ |
| `Content-Security-Policy-Report-Only` | (CSP allowlist — 下記参照) | 全環境 | ✅ |
| `Content-Security-Policy` (enforce版) | — | **付与なし** | ✅ (意図通り) |

---

### A-2: HSTS 本番限定 ✅ PASS

```ts
// next.config.ts:45-52
...(isProd
  ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
  : [])
```

`isProd = process.env.NODE_ENV === "production"`

- dev server (`npm run dev`) → HSTS なし ✅
- production server (`npx next start`) → HSTS あり ✅

**curl 実測 (dev)**:
```
# HSTS ヘッダなし — 確認済
```

**curl 実測 (prod)**:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload  ✅
```

---

### A-3: Report-Only のみ（enforce 版なし）✅ PASS

全ルートで `Content-Security-Policy-Report-Only` のみ付与。`Content-Security-Policy` ヘッダは存在しない。

```
# curl -sI http://localhost:3001/ | grep -i content-security
Content-Security-Policy-Report-Only: default-src 'self'; ...  ← ✅
# (Content-Security-Policy: は出力されない)
```

---

### A-4: 適用ルート網羅 ✅ PASS

`source: "/(.*)"` で全ルートに一括適用（middleware ではなく `next.config.ts` の `headers()` API を使用）。

実測確認ルート:

| ルート | X-Frame-Options | CSP-Report-Only | HSTS(prod) |
|--------|-----------------|-----------------|------------|
| `/` | DENY | ✅ | ✅ |
| `/login` | DENY | ✅ | — (dev) |
| `/dashboard` (redirect→/login) | DENY | ✅ | — (dev) |
| `/s/testslug` | DENY | ✅ | — (dev) |

---

### A-5: CSP allowlist 外部ソース網羅確認 ✅ PASS

コードスキャン結果と allowlist の対応:

| 外部サービス | browser アクセス有無 | allowlist 対応 | 根拠 |
|------------|-----------------|---------------|------|
| Supabase REST | ✅ あり | `connect-src: sabriblwzzsvxsfxoebe.supabase.co` | `lib/supabase/client.ts` |
| Supabase Realtime (WSS) | ✅ あり | `connect-src: wss://sabriblwzzsvxsfxoebe.supabase.co` | `DashboardClient.tsx:253` |
| Vercel Analytics (script) | ✅ あり | `script-src: va.vercel-scripts.com` | `layout.tsx:3` `<Analytics />` |
| Vercel Analytics (beacon) | ✅ あり | `connect-src: vitals.vercel-insights.com` | `@vercel/analytics/next` |
| Google Fonts (Geist) | ❌ なし | 追加不要 | `next/font/google` はビルド時セルフホスト |
| Google Maps API | ❌ なし | 追加不要 | サーバーサイド専用 (`api/neighborhood/route.ts`) |
| Stripe JS | ❌ なし | 追加不要 | Checkout はリダイレクト方式（Stripe Elements iframe 不使用） |
| Trestle MLS | ❌ なし | 追加不要 | サーバーサイド専用 (`api/mls/lot-data/route.ts`) |
| ProductHunt | ❌ なし | 追加不要 | テキスト/CSS のみ（外部 img/script なし） |
| PDF (jspdf) | data: / blob: | `img-src data: blob:` | PDF canvas データ / ダウンロード blob URL |

---

## B. ビルド / 型 ✅ PASS

```
✓ Compiled successfully in 2.9s
✓ Generating static pages using 7 workers (37/37) in 275ms
```

TypeScript エラーなし。全 37 ページ正常生成。

---

## C. ランタイム実測

### 検証方法

- Playwright 1.60.0 (Chromium headless) でブラウザ操作
- `securitypolicyviolation` イベントを各ページでリッスン
- dev server (port 3000) と production server (port 3001) の両方で実施

### C-1: dev server 実測

```
✓ / — 10 CSP violation(s), page loaded OK
✓ /login — 9 CSP violation(s), page loaded OK
✓ /upgrade — 9 CSP violation(s), page loaded OK
✓ /forgot-password — 9 CSP violation(s), page loaded OK
✓ /privacy — 133 CSP violation(s), page loaded OK
✓ /terms — 102 CSP violation(s), page loaded OK
✓ /s/testslug — 20 CSP violation(s), page loaded OK

=== UNIQUE CSP VIOLATIONS (DEV) ===
  directive=script-src  blocked=eval  pages=全ページ
```

**違反は 1 種類のみ: `script-src: eval`**

**原因**: Next.js の開発モードが webpack HMR (Hot Module Replacement) と source map 生成のために `eval()` を使用する。本番ビルドでは HMR が無効になるため `eval` は使用されない。

**全ページが正常ロード** — Report-Only のためブロックなし ✅

---

### C-2: production server 実測 ✅ PASS

```
✓ / — 0 violation(s)
✓ /login — 0 violation(s)
✓ /upgrade — 0 violation(s)
✓ /forgot-password — 0 violation(s)
✓ /privacy — 0 violation(s)
✓ /terms — 0 violation(s)
✓ /s/testslug — 0 violation(s)

=== UNIQUE CSP VIOLATIONS (PROD BUILD) ===
(none)

Total unique: 0
```

**本番ビルドで CSP 違反 0 件** ✅

---

## 最終 PASS/FAIL サマリー

| # | チェック項目 | 結果 |
|---|-------------|------|
| A-1 | 必須 4 ヘッダー全ルート付与 | ✅ PASS |
| A-2 | HSTS 本番のみ | ✅ PASS |
| A-3 | CSP は Report-Only のみ（enforce 版なし） | ✅ PASS |
| A-4 | 全ルート網羅 (`source: "/(.*)"`) | ✅ PASS |
| A-5 | 外部ソース allowlist 網羅（Stripe/Supabase/Google Maps/自ドメイン） | ✅ PASS |
| B | ビルド・型 | ✅ PASS |
| C-1 | dev runtime — eval 違反のみ（Next.js HMR、本番不発生） | ⚠️ 想定内 |
| C-2 | prod runtime — 違反 0 件 | ✅ PASS |

---

## enforce 切替前に足すべきソース

**なし** — 本番ビルドで違反が 0 件のため、現在の allowlist で enforce 版への切替が可能。

### enforce 切替手順

[next.config.ts](../../next.config.ts) で以下の 1 行を変更するだけ:

```diff
- key: "Content-Security-Policy-Report-Only",
+ key: "Content-Security-Policy",
```

### 将来的な強化案（任意）

1. **`'unsafe-inline'` 除去 (script-src)**: Next.js の nonce サポート (`experimental.cspHeader`) を利用。`__NEXT_DATA__` に nonce を付与することで `unsafe-inline` を除去可能。セキュリティ向上につながるが実装コストあり。
2. **`'unsafe-eval'` の明示的不使用確認**: 本番では 0 違反なので追加不要。dev 環境のみ `eval` 使用。
3. **CSP reporting endpoint**: `report-uri` または `report-to` を追加すると違反をサーバーに集約できる。現状は browser console のみ。

---

_検証日: 2026-05-28 | dev: 違反 1 種(eval, HMR 由来) | prod: 違反 0 件 | push はしていない_
