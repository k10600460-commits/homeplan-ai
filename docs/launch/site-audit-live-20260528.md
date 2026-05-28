# 本番サイト総合監査 — 2026-05-28

**監査方法:** curl（本番 HTTP アクセス）+ コード参照  
**監査対象:** https://splanai.com

---

## 重要前提: Vercel Bot Challenge (HTTP 429)

すべての curl リクエスト（User-Agent ブラウザ偽装含む）が HTTP 429 を返した。

```
x-vercel-mitigated: challenge
x-vercel-challenge-token: ...
```

これは Vercel の **Attack Challenge Mode** が有効になっている状態。  
ライブ HTML/ヘッダーを直接取得できないため、**本番反映の確認はコード参照（git log）を根拠とし、  
ライブ値が必要な項目は「コード確認済み／ライブ未確認」と明記する。**

→ 429 問題の SEO への影響は後述「SEO」項目参照。

---

## A. 今日のデプロイが本番に反映されているか

### 1. git push 状況

```
local  HEAD : 94ebd21 feat(legal): privacy/terms pages, signup consent checkbox, trial disclosure, AI disclaimers
origin/main : 94ebd21 (同一)
```

| コミット | 内容 | 状態 |
|---------|------|------|
| `94ebd21` | feat(legal): consent/disclaimer/footer 全実装 | ✅ push 済み |
| `98b2475` | fix(security): Low-1/2/4 | ✅ push 済み |
| `5bfbe4b` | feat(security): headers + CSP report-only (M-5) | ✅ push 済み |
| `5e83661` | feat(security): Postgres rate limit (M-4, H-3) | ✅ push 済み |
| `c0e67b6` | fix(security): round 1 hardening | ✅ push 済み |

未コミットファイル: `.claude/settings.json` のみ（ソースコードではないため問題なし）。  
**✅ ローカルとリモートの差異なし。全コミット origin/main に push 済み。**

---

### 2. HTTP ステータス

| URL | ステータス | 判定 |
|-----|-----------|------|
| https://splanai.com/ | 429 (bot challenge) | ⚠️ ライブ未確認 |
| https://splanai.com/privacy | 429 | ⚠️ ライブ未確認 |
| https://splanai.com/terms | 429 | ⚠️ ライブ未確認 |
| https://splanai.com/login | 429 | ⚠️ ライブ未確認 |
| https://splanai.com/upgrade | 429 | ⚠️ ライブ未確認 |

コード上は全ページが有効な Next.js routes として存在する（ビルド成功、37 pages 確認済み）。

---

### 3. /privacy・/terms コンテンツ

| 確認項目 | 結果 |
|--------|------|
| `privacy/page.tsx` LAST_UPDATED | ✅ "May 28, 2026" ([src/app/privacy/page.tsx:10](../../src/app/privacy/page.tsx#L10)) |
| `terms/page.tsx` LAST_UPDATED | ✅ "May 28, 2026" ([src/app/terms/page.tsx:10](../../src/app/terms/page.tsx#L10)) |
| canonical MD ファイル | ✅ `content/legal/privacy-policy.md` / `content/legal/terms-of-service.md` 存在 |

ライブ HTML 取得不可（429）。コード上は正しい日付。

---

### 4. Footer の Terms・Privacy リンク

| ページ | Terms | Privacy | 判定 |
|--------|-------|---------|------|
| LP (`HomePageClient.tsx`) | ✅ L1061 | ✅ L1062 | ✅ |
| /login | ✅ L317 | ✅ L318 | ✅ |
| /upgrade | ✅ L141 | ✅ L142 | ✅ |
| /results | ✅ L1163 | ✅ L1164 | ✅ |
| /s/[slug] share portal | ✅ (absolute URL) | ✅ (absolute URL) | ✅ |

**✅ 全対象ページに Terms・Privacy リンクあり。**

---

### 5. サインアップ同意チェックボックス

| 確認項目 | コード証拠 | 判定 |
|--------|-----------|------|
| チェックボックスはサインアップタブのみ表示 | [login/page.tsx:270-284](../../src/app/login/page.tsx#L270) (`else` ブランチ内) | ✅ |
| サインアップ送信ボタン: `disabled={loading \|\| !agreedToTerms}` | [login/page.tsx:288](../../src/app/login/page.tsx#L288) | ✅ |
| ログイン送信ボタン: `disabled={loading}` のみ | [login/page.tsx:185](../../src/app/login/page.tsx#L185) | ✅ |
| `terms_agreed_at` は `handleSignUp` のみで記録 | [login/page.tsx:71](../../src/app/login/page.tsx#L71) | ✅ |

**✅ 既存ユーザーのログインを妨げていない（前回 /goal 検証済み）。**

---

### 6. 料金トライアル表示

| 箇所 | テキスト | 判定 |
|------|---------|------|
| LP EN Pro | "14-day free trial, then $49/mo. Cancel anytime before it ends." | ✅ |
| LP EN Team | "14-day free trial, then $149/mo. Cancel anytime before it ends." | ✅ |
| LP ES Pro | "14 días de prueba gratis, luego $49/mes. Cancela antes que termine." | ✅ |
| LP ES Team | "14 días de prueba gratis, luego $149/mes. Cancela antes que termine." | ✅ |
| /upgrade | "14-day free trial, then $49/mo. Cancel anytime before it ends." | ✅ |

**✅ EN/ES 両言語で価格・解約条件を明示。**

---

### 7. AI 免責表示

| 箇所 | テキスト | 判定 |
|------|---------|------|
| `/results` 画面 | "AI-generated concept — illustration only. Not an architectural or engineering plan. Verify with a licensed professional before construction." | ✅ [results/page.tsx:796](../../src/app/results/page.tsx#L796) |
| `/results` PDF footer | "Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them." | ✅ [results/page.tsx:246](../../src/app/results/page.tsx#L246) |
| `/s/[slug]` 画面 | 同上短文 | ✅ [SharePortalClient.tsx:550](../../src/app/s/[slug]/SharePortalClient.tsx#L550) |
| `/s/[slug]` PDF footer | "For informational purposes only. Data subject to change. Not a substitute for professional architectural or legal advice." | ❌ [SharePortalClient.tsx:290](../../src/app/s/[slug]/SharePortalClient.tsx#L290) — **旧文言のまま未更新** |
| Chinese PDF (`zh-pdf-html.ts`) | 中国語 + 英語長文追記済み | ✅ [zh-pdf-html.ts:65](../../src/lib/zh-pdf-html.ts#L65) |

**❌ SharePortalClient.tsx の PDF footer 免責文が旧文言のまま。**  
→ `/s/[slug]` でダウンロードされる PDF は古い disclaimer。要修正。

---

## B. セキュリティヘッダー（Round 3）

ライブ取得不可（429）のため **コード確認**。`next.config.ts` で全ルート `"/(.*)"` に適用済み。

| ヘッダー | 設定値 | 判定 |
|--------|--------|------|
| `Content-Security-Policy-Report-Only` | 設定済み（9 ディレクティブ） | ✅ **Report-Only（非 enforce）** |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`（本番のみ） | ✅ |
| `X-Frame-Options` | `DENY` | ✅ |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), interest-cohort=()` | ✅ |
| `Content-Security-Policy`（enforce） | 未設定（Report-Only のみ） | ⚠️ 意図的：violation 確認後に切替予定 |

ライブヘッダーの実際の出力は Vercel bot challenge のため確認不可。コードは push 済み。  
**✅ 全ヘッダーコード上で正しく設定済み。CSP は意図通り Report-Only。**

---

## C. SEO / クロール可否 ⚠️ 最重要

### 9. robots.txt（コード確認）

`src/app/robots.ts` の内容（生成される robots.txt）:

```
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Omgilibot
Disallow: /

User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /results
Disallow: /s/
Disallow: /api/
Disallow: /invite

Sitemap: https://splanai.com/sitemap.xml
```

コード上: ✅ Googlebot 許可、LP クロール許可、アプリ画面除外、AI クローラー除外。  
**⚠️ ただし、現在 robots.txt 自体が HTTP 429 で返されており、Googlebot が取得できない状態。**

---

### 10. noindex チェック ⚠️

| ページ | robots 設定 | 判定 |
|--------|-----------|------|
| layout.tsx（全体デフォルト） | `"index, follow"` | ✅ |
| LP (`/`) | 明示なし → デフォルト inherit | ✅ |
| `/login` | 明示なし | ✅ |
| `/privacy` | `robots: "noindex"` [privacy/page.tsx:7](../../src/app/privacy/page.tsx#L7) | ⚠️ 法的ページ意図的 noindex |
| `/terms` | `robots: "noindex"` [terms/page.tsx:7](../../src/app/terms/page.tsx#L7) | ⚠️ 法的ページ意図的 noindex |

LP・login に誤った noindex なし。privacy/terms の noindex は法的ページのため意図的と判断。  
X-Robots-Tag はライブ未確認（429）。コード上の `next.config.ts` に X-Robots-Tag 設定なし。

---

### 11. sitemap.xml

`src/app/sitemap.ts` に定義済み。LP のみ収録（`https://splanai.com`）。  
robots.ts で `Sitemap: https://splanai.com/sitemap.xml` 参照あり ✅。  
ライブ 200 確認不可（429）。

---

### 12. LP の SEO タグ

| タグ | 値 | 判定 |
|-----|-----|------|
| `<title>` | "SplanAI — AI Floor Plan Generator for Home Builders" | ✅ |
| `<meta name="description">` | "Turn any lot into 3 custom floor plan proposals..." | ✅ |
| canonical | `https://splanai.com` (`alternates` in page.tsx) | ✅ |
| og:title | ✅ | ✅ |
| og:description | ✅ | ✅ |
| og:image | `https://splanai.com/og-image.png` (public/og-image.png 存在確認済み) | ✅ |
| favicon | `src/app/favicon.ico` 存在確認済み | ✅ |
| twitter:card | `summary_large_image` | ✅ |

**✅ 全 SEO タグ揃い。**

---

## D. 一般ヘルス

### 13. http:// / www. リダイレクト

`next.config.ts` / `vercel.json` に www/http redirect の明示設定なし。  
Vercel は custom domain 設定で http→https と www→apex を自動 301/308 で処理するため、  
通常は問題ない。ライブ確認不可（429）。**⚠️ ライブ未確認（コードに設定なし、Vercel デフォルト依存）。**

---

### 14. 主要内部リンク

コード確認:
- `next.config.ts` に `/sign-up`, `/signup`, `/register`, `/auth/signup`, `/auth/sign-up` → `/login?tab=signup` の 308 リダイレクトあり ✅
- `/forgot-password`（login ページからリンク）: `src/app/forgot-password/page.tsx` 存在確認 ✅
- ライブ 404 確認は 429 のため不可。

---

### 15. 静的アセット

| アセット | コード確認 | 判定 |
|---------|----------|------|
| `og-image.png` | `public/og-image.png` 存在確認 | ✅ |
| `favicon.ico` | `src/app/favicon.ico` 存在確認 | ✅ |
| `logo.png` | `public/logo.png` 存在確認 | ✅ |
| 混在コンテンツ (http://) | `next.config.ts` に https 強制設定あり（HSTS+CSP）。コード内の外部 URL は全て https 参照 | ✅ |

ライブ 200 確認は 429 のため不可。

---

## 総評

### 判定サマリー

| カテゴリ | ✅ | ⚠️ | ❌ |
|---------|---|---|---|
| A. デプロイ反映 | 6 | 1 | 1 |
| B. セキュリティヘッダー | 5 | 1 | 0 |
| C. SEO | 5 | 3 | 0 |
| D. ヘルス | 3 | 2 | 0 |

---

### 優先対応リスト

| 優先度 | 問題 | 対応 |
|--------|------|------|
| **🔴 P1** | **Vercel Bot Challenge (HTTP 429) が全 URL に適用中** | Vercel Dashboard → Settings → Security で Attack Challenge Mode を無効化するか、Googlebot の IP を exempt に追加。robots.txt・sitemap.xml が 429 では Google に届かずインデックス不能。 |
| **🟠 P2** | **SharePortalClient.tsx PDF footer 免責文が旧文言** | [SharePortalClient.tsx:290](../../src/app/s/[slug]/SharePortalClient.tsx#L290) の `doc.text(...)` を results/page.tsx と同じ長文 disclaimer に更新する。 |
| **🟡 P3** | **CSP が Report-Only のまま** | violation ログを確認後、`Content-Security-Policy-Report-Only` → `Content-Security-Policy` に切替える（`next.config.ts` 1行変更）。 |
| **🟡 P3** | **www/http リダイレクト未コード確認** | Vercel Dashboard → Domains でリダイレクト設定を目視確認。 |

---

### 結論

**コード面は健全**。セキュリティヘッダー・法的対応・SEO メタ・footer リンク・AI 免責・同意チェックはすべて正しくコードに実装され、origin/main に push済み。  
**ライブ面で1点緊急事項**: Vercel の Attack Challenge Mode が有効になっており、Googlebot を含む全 bot が 429 を受けている可能性がある。これにより robots.txt・sitemap.xml が Google 側に届かず、SEO クロールが止まっているリスクがある。**最優先で Vercel Dashboard を確認すること。**

また、SharePortalClient.tsx の PDF footer 免責文（旧文言のまま）は次のコミットで修正が必要。
