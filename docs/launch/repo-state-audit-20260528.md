# SplanAI リポジトリ状態監査 — 2026-05-28

**調査方法:** 読み取り専用（コード変更なし・git add/commit/push なし）  
**根拠:** 各項目に `ファイル:行` を付記。推測は「不明」と明記。

---

## サマリー表

| カテゴリ | 状態 | 主要事項 |
|---------|------|---------|
| A. Git / デプロイ | ⚠️ | P2 fix (ccf4809) がローカルのみ。push 待ち |
| B. 法務実装 | ✅ | 全項目コード確認済み。P2 fix は local commit 済み |
| C. 料金確定 | ✅ | CLAUDE.md と完全一致。Team=9999 で実装（公称:無制限） |
| D. セキュリティ | ✅ | CSP=Report-Only、ヘッダー全配置、8ルートに rate limit |
| E. 営業機能 | ⚠️ | sales-dm-draft はスケルトン（Week 1 実装予定） |
| F. 旧文言 | ✅ | pre-launch 文字列はコード内に残るが非表示。PH バッジは post-launch |
| G. docs/launch 棚卸し | ✅ | 33 ファイル確認済み |

---

## A. Git / デプロイ状態

### ブランチ・コミット状況

```
ブランチ: main
Local HEAD : ccf4809  fix(legal): unify portal PDF footer AI disclaimer with results
origin/main: 94ebd21  feat(legal): privacy/terms pages, signup consent checkbox, trial disclosure, AI disclaimers
差分       : ローカルが 1 コミット先行 → push 待ち
```

未コミットファイル: `.claude/settings.json`（ソースコードではない）

### git log --oneline -20

| SHA | メッセージ | origin/main |
|-----|-----------|------------|
| ccf4809 | fix(legal): unify portal PDF footer AI disclaimer | ❌ local only |
| 94ebd21 | feat(legal): privacy/terms/consent/disclaimer | ✅ pushed |
| 98b2475 | fix(security): Low-1/2/4 | ✅ pushed |
| 5bfbe4b | feat(security): headers + CSP report-only (M-5) | ✅ pushed |
| 5e83661 | feat(security): Postgres rate limit (M-4, H-3) | ✅ pushed |
| c0e67b6 | fix(security): round 1 hardening | ✅ pushed |
| e21d4dc | chore: update .claude settings | ✅ pushed |
| 6bebc57 | feat(lp): post-launch PH badge | ✅ pushed |
| d913911 | feat(checkout): promo codes | ✅ pushed |
| 8f1bd3a | fix(docs): CLAUDE.md Pro limit | ✅ pushed |

**⚠️ `ccf4809`（SharePortalClient PDF 免責文修正）が push 待ち。**  
指定のセキュリティコミット(c0e67b6/5e83661/5bfbe4b)は全て origin/main に含まれる。

---

## B. 法務組み込みの本番反映

### content/legal/* ファイル

| ファイル | 存在 | Last Updated（ファイル冒頭） |
|---------|------|---------------------------|
| content/legal/privacy-policy.md | ✅ | "May 28, 2026"（L3） |
| content/legal/terms-of-service.md | ✅ | "May 28, 2026"（L3） |

### privacy / terms ページの LAST_UPDATED

```
src/app/privacy/page.tsx:10  const LAST_UPDATED = "May 28, 2026";
src/app/terms/page.tsx:10    const LAST_UPDATED = "May 28, 2026";
```

両ページとも L34 で `<p>Last updated: {LAST_UPDATED}</p>` として表示。✅

### login/page.tsx 同意チェックボックス

| 確認項目 | ファイル:行 | 値 |
|--------|-----------|-----|
| `agreedToTerms` state | [login/page.tsx:31](../../src/app/login/page.tsx#L31) | `useState(false)` |
| ログインボタン disabled 条件 | [login/page.tsx:185](../../src/app/login/page.tsx#L185) | `disabled={loading}` のみ |
| サインアップボタン disabled 条件 | [login/page.tsx:288](../../src/app/login/page.tsx#L288) | `disabled={loading \|\| !agreedToTerms}` |
| チェックボックス配置 | [login/page.tsx:270-284](../../src/app/login/page.tsx#L270) | signup タブの `else` ブランチ内のみ |
| `terms_agreed_at` 記録 | [login/page.tsx:71](../../src/app/login/page.tsx#L71) | `handleSignUp` 内のみ |

✅ ログインは従来通り、チェック不要。サインアップのみ必須。

### HomePageClient トライアル文言

| 箇所 | テキスト | ファイル:行 |
|------|---------|-----------|
| EN Pro | "14-day free trial, then $49/mo. Cancel anytime before it ends." | [HomePageClient.tsx:89](../../src/app/HomePageClient.tsx#L89) |
| EN Team | "14-day free trial, then $149/mo. Cancel anytime before it ends." | [HomePageClient.tsx:90](../../src/app/HomePageClient.tsx#L90) |
| ES Pro | "14 días de prueba gratis, luego $49/mes. Cancela antes que termine." | [HomePageClient.tsx:195](../../src/app/HomePageClient.tsx#L195) |
| ES Team | "14 días de prueba gratis, luego $149/mes. Cancela antes que termine." | [HomePageClient.tsx:196](../../src/app/HomePageClient.tsx#L196) |

✅ EN/ES 両言語で価格・解約条件を明示。

### AI 免責文の配置状況

| 箇所 | 文言 | ファイル:行 | 状態 |
|------|------|-----------|------|
| results 画面 | 短文 | [results/page.tsx:796](../../src/app/results/page.tsx#L796) | ✅ |
| results PDF フッター | 長文 | [results/page.tsx:246](../../src/app/results/page.tsx#L246) | ✅ |
| SharePortalClient 画面 | 短文 | [SharePortalClient.tsx:550](../../src/app/s/[slug]/SharePortalClient.tsx#L550) | ✅ |
| SharePortalClient PDF フッター | 長文（ccf4809 で修正済み） | [SharePortalClient.tsx:290](../../src/app/s/[slug]/SharePortalClient.tsx#L290) | ✅ local commit 済み・push 待ち |
| zh-pdf-html.ts フッター | 中国語 + 英語長文 | [zh-pdf-html.ts:65](../../src/lib/zh-pdf-html.ts#L65) | ✅ |

**短文（画面）:** "AI-generated concept — illustration only. Not an architectural or engineering plan. Verify with a licensed professional before construction."  
**長文（PDF）:** "Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them."

---

## C. 現行料金の確定

### コード上の定義（[src/lib/usage.ts:9-13](../../src/lib/usage.ts#L9)）

```typescript
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3,    label: 'Free Plan' },
  pro:  { requestsPerMonth: 100,  label: 'Pro Plan ($49/mo)' },
  team: { requestsPerMonth: 9999, label: 'Team Plan ($149/mo)' },
}
```

### CLAUDE.md との一致確認

| プラン | CLAUDE.md | コード実値 | 一致 |
|-------|-----------|----------|------|
| Free 生成上限 | 3/月 | 3 | ✅ |
| Pro 生成上限 | 100/月 | 100 | ✅ |
| Team 生成上限 | 無制限（fair use） | 9999 | ✅（コード上は 9999 で無制限を表現） |
| Pro 価格 | $49/mo | ラベル "$49/mo"、Stripe price は env 参照 | ✅ |
| Team 価格 | $149/mo | ラベル "$149/mo"、Stripe price は env 参照 | ✅ |
| トライアル日数 | 14日 | `TRIAL_PERIOD_DAYS = 14` [stripe.ts:19](../../src/lib/stripe.ts#L19) | ✅ |
| Free クレカ不要 | ✅ | signup は checkout を通らない（コード確認済み） | ✅ |

### Stripe price ID の整合

```
src/lib/stripe.ts:11  STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID!       // Pro
src/lib/stripe.ts:12  STRIPE_TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID!  // Team
src/lib/stripe.ts:14  planFromPriceId(priceId): priceId === STRIPE_TEAM_PRICE_ID ? "team" : "pro"
```

実際の price ID 値は `.env` 参照のため、コード上では確認不可（CLAUDE.md ルールにより `.env` は読まない）。  
コード構造は正しく、Pro/Team の price ID を環境変数経由で参照している。

---

## D. セキュリティ設定の現状

### next.config.ts ヘッダー

| ヘッダー | 設定値 | ファイル:行 |
|--------|--------|-----------|
| CSP | **`Content-Security-Policy-Report-Only`（enforce ではない）** | [next.config.ts:39](../../next.config.ts#L39) |
| HSTS | `max-age=63072000; includeSubDomains; preload`（`isProd` のみ） | [next.config.ts:30-36](../../next.config.ts#L30) |
| X-Frame-Options | `DENY` | [next.config.ts:22](../../next.config.ts#L22) |
| X-Content-Type-Options | `nosniff` | [next.config.ts:26](../../next.config.ts#L26) |
| Referrer-Policy | `strict-origin-when-cross-origin` | [next.config.ts:29](../../next.config.ts#L29) |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(self), interest-cohort=()` | [next.config.ts:42](../../next.config.ts#L42) |

CSP は `Report-Only` のまま（意図的：violation 確認後に enforce へ切替予定）。

### checkRateLimitDB 適用ルート（全8ルート）

| ルート | キー | ファイル:行 |
|-------|------|-----------|
| /api/generate | `generate:user:{id}` | [generate/route.ts:67](../../src/app/api/generate/route.ts#L67) |
| /api/generate-pdf | `pdf:user:{id}` | [generate-pdf/route.ts:208](../../src/app/api/generate-pdf/route.ts#L208) |
| /api/neighborhood | `neighborhood:user:{id}` | [neighborhood/route.ts:113](../../src/app/api/neighborhood/route.ts#L113) |
| /api/checkout | `checkout:ip:{ip}` | [checkout/route.ts:19](../../src/app/api/checkout/route.ts#L19) |
| /api/stripe/checkout | `checkout:ip:{ip}` | [stripe/checkout/route.ts:19](../../src/app/api/stripe/checkout/route.ts#L19) |
| /api/stripe/team-checkout | `checkout:ip:{ip}` | [stripe/team-checkout/route.ts:19](../../src/app/api/stripe/team-checkout/route.ts#L19) |
| /api/share/create | `share:user:{id}` | [share/create/route.ts:22](../../src/app/api/share/create/route.ts#L22) |
| /api/share/event | `share_event:ip:{ip}` | [share/event/route.ts:16](../../src/app/api/share/event/route.ts#L16) |

✅ 8/8 ルートに適用済み。

---

## E. 営業機能の実装状態

### sales-dm-draft/route.ts — **スケルトン**

```typescript
// Coming in Week 1 post-launch:
// - Fetch 5 pending companies from outreach_log (TX/FL/NC priority)
// - web_fetch each company's website / Facebook
// - Apply DM pattern selection logic (A-E) from agents/sales.md §4
// - Generate personalized DM drafts via Claude API
// - Save to obsidian-vault/YYYY-MM-DD-sales-drafts.md
// - Notify Shuraemon via daily-brief escalation
console.log("[sales-dm-draft] Skeleton fired — full implementation coming Week 1 post-launch");
return NextResponse.json({ ok: true, status: "skeleton" });
```

**⚠️ 本体未実装。** CRON は毎日 JST 8:00 に叩くが現在は `{ ok: true, status: "skeleton" }` を返すのみ。  
DB 接続（outreach_log テーブル）確認のみ実装済み。

---

## F. ローンチ後の古い文言・状態

### ProductHuntBadge 現状

| state | テキスト | 使用中 |
|-------|---------|-------|
| `pre-launch` | "🚀 Launching on ProductHunt · May 26" | ❌ 非表示（dead code） |
| `launch-day` | "🚀 LIVE on ProductHunt — Upvote us today!" | ❌ 非表示（dead code） |
| **`post-launch`** | "🏆 Featured on Product Hunt" | **✅ 現在使用中** |
| `top-product` | "🏆 #1 Product of the Day on ProductHunt" | ❌ 未使用 |

[HomePageClient.tsx:551](../../src/app/HomePageClient.tsx#L551): `<ProductHuntBadge state="post-launch" lang={lang} />`

"Launching May 26" の文字列は `ProductHuntBadge.tsx:72` の pre-launch バリアントに残存するが、  
ユーザーには表示されない。削除するかどうかはコスメティックな判断（機能上は問題なし）。

---

## G. docs/launch/ ファイル棚卸し（33ファイル）

| ファイル | 日付 | 1行要約 |
|---------|------|---------|
| api-cost-surface-audit-20260524.md | 05-24 | API コスト発生経路の全ルート調査 |
| apple-pay-domain-verification-20260524.md | 05-24 | Apple Pay ドメイン検証設定の確認 |
| coverage-area-20260526.md | 05-26 | 50州カバレッジとRentCast地理的制限の確認 |
| csp-verify-20260528.md | 05-28 | CSP Report-Only ヘッダーの Playwright 検証結果 |
| launch-day-log-20260526.md | 05-26 | ローンチ当日 12コミットの完了ログ |
| legal-compliance-20260528.md | 05-28 | 法的対応（同意/免責/フッター）実装の変更ログ |
| lp-v2-proposal.md | 05-21 | LP v2 リデザイン提案（実装済み） |
| neighborhood-data-status.md | 05-21 | Google Maps + RentCast 近隣データの状態調査 |
| ogp-meta-verification-20260524.md | 05-24 | OGP メタタグの実装確認 |
| oi-002-checkout-pattern-verification-20260524.md | 05-24 | チェックアウトフロー検証 |
| oi013-stripe-verification-20260526.md | 05-26 | Stripe ライブ設定の確認 |
| outreach-log-table-existence-20260526.md | 05-26 | outreach_log テーブルの存在確認 |
| payment-methods-status.md | 05-21 | 支払い方法（Card/Apple Pay/Google Pay）の状態 |
| pdf-disclaimer-fix-20260528.md | 05-28 | SharePortalClient PDF フッター免責文修正ログ |
| ph-badge-live-activation-20260526.md | 05-26 | PH バッジ launch-day 状態への切替記録 |
| ph-first-comment-claim-check-20260526.md | 05-26 | PH Maker コメント事実確認 |
| plan-copy-consistency-20260524.md | 05-24 | 料金プランのコピー一貫性確認 |
| plan-differentiation-matrix-20260524.md | 05-24 | Free/Pro/Team 差別化マトリクス |
| plan-usage-limits-audit-20260524.md | 05-24 | 生成上限の実装確認（コード根拠） |
| post-launch-sales-20260526.md | 05-26 | ローンチ後の営業戦略メモ |
| pricing-verification-20260528.md | 05-28 | 料金体系の3プラン照合（コード vs CLAUDE.md） |
| product-facts-for-maker-comment-20260526.md | 05-26 | Maker コメント用プロダクト事実集 |
| ratelimit-verify-20260528.md | 05-28 | DB レート制限の実装検証 |
| reply-to-and-c01-fix-20260526.md | 05-26 | Reply-to メール設定の修正 |
| security-audit-20260521.md | 05-21 | セキュリティ初回監査（Round 1 前） |
| security-audit-20260528.md | 05-28 | セキュリティ Round 1-4 完了後の総括監査 |
| security-fix-verify-20260528.md | 05-28 | セキュリティ修正の検証レポート |
| seo-audit-20260526.md | 05-26 | SEO 状態の監査 |
| session-checkpoint-20260524.md | 05-24 | 05-24 セッション完了事項の引き継ぎメモ |
| site-audit-live-20260528.md | 05-28 | 本番サイト総合監査（Vercel 429 問題を発見） |
| team-path-fixes-20260524.md | 05-24 | Team プランのパス修正記録 |
| team-unlimited-scope-20260524.md | 05-24 | Team 無制限生成の実装範囲確認 |
| today-verification-20260526.md | 05-26 | ローンチ日の全機能検証 |
| vercel-waf-checklist.md | 未日付 | Vercel Dashboard で人間が実施する WAF 設定チェックリスト |

---

## 次に手動でやるべきこと

1. **`git push origin main`** — `ccf4809`（SharePortalClient PDF 免責文修正）がローカルのみ。  
   このコミット1件を push すれば全法務対応が本番に反映される。

2. **Vercel Dashboard → Attack Challenge Mode の確認・無効化**  
   (`site-audit-live-20260528.md` で発見した P1 問題。全 URL が 429 返しており Googlebot がブロックされている可能性あり。)

3. **CSP enforce への切替**（任意・タイミング次第）  
   `next.config.ts` のキー名を `Content-Security-Policy-Report-Only` → `Content-Security-Policy` に変更するだけ。  
   violation ログ（Vercel Functions ログ）を確認してから切替を推奨。

4. **sales-dm-draft/route.ts の本体実装**（Week 1 post-launch 予定）  
   スケルトンのまま。outreach_log テーブルへの接続確認のみ実装済み。

5. **ProductHuntBadge の pre-launch 文字列**（コスメティック、低優先）  
   `"🚀 Launching on ProductHunt · May 26"` が dead code として残存。  
   削除してもよいが機能上は無害。
