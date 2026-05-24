# セッション・チェックポイント — 2026-05-24

> このファイルは 2026-05-24 の作業セッションの全完了事項・決定・残課題を記録する。
> 次セッションはこのファイルを起点に現状を把握できる。
> コード変更の詳細は各 docs/launch/ ドキュメントおよび git log を参照。

---

## 最終 commit 状況

| commit | 内容 |
|--------|------|
| `38aea5d` | fix(auth): token_hash confirm route（前セッション） |
| `eb62804` | feat(plans): B' 実装 — Pro=100/月・Team=Unlimited(fair use)でコード・LP・Terms・メールを全一致 |
| `5af3377` | fix(plans): R-01・R-02・Team経路 — Pro/Team 誤表示を全修正 |

---

## A. 今セッションで完了した作業

### OGP・メタタグ検証（OI-011 の一部）

- `layout.tsx` に `og:site_name: "SplanAI"` を追加（コード修正 + commit 済み）
- LP・terms・privacy・dashboard の全 metadata が splanai.com ドメインで正しく設定されていることを確認
- `/s/[slug]`（顧客共有ポータル）に `generateMetadata` が未実装と判定 → post-launch 対応
- 詳細: [`docs/launch/ogp-meta-verification-20260524.md`](ogp-meta-verification-20260524.md)

### OI-002 Apple Pay — クローズ（対応不要と確定）

- 決済フロー全体を点検し、`stripe.checkout.sessions.create()` → `session.url` へリダイレクトの Pattern A（Stripe Checkout ホスト型）と確定
- Apple Pay は `checkout.stripe.com` 上で処理されるため、`splanai.com` のドメイン登録・Stripe Verify は不要
- `public/.well-known/` のファイル配置も不要（配置済みでも無害）
- **OI-002 はクローズ**
- 詳細: [`docs/launch/oi-002-checkout-pattern-verification-20260524.md`](oi-002-checkout-pattern-verification-20260524.md)

### API コスト全体像の精査

- 間取り生成 (`/api/generate`) が毎回 claude-sonnet-4-6 を 1回呼ぶことをコードから確定
- 1回あたりコスト概算: ≈$0.032〜$0.035（キャッシュヒット時 $0.032）
- Google Maps・RentCast は自動 stop 設定済みで安全圏内
- Anthropic の spend limit 設定が必要であることを確認（OI-005 → ユーザーが設定済み）
- 詳細: [`docs/launch/api-cost-surface-audit-20260524.md`](api-cost-surface-audit-20260524.md)

### プラン差別化マトリクス策定

- Free / Pro / Team の機能差異を全面棚卸し
- 詳細: [`docs/launch/plan-differentiation-matrix-20260524.md`](plan-differentiation-matrix-20260524.md)

### Team 無制限化スコープ調査

- 変更は `src/lib/usage.ts:12` の 1行（`100 → 9999`）のみ
- `Infinity` は `JSON.stringify` で `null` になるため却下、9999 番兵値を採用
- 詳細: [`docs/launch/team-unlimited-scope-20260524.md`](team-unlimited-scope-20260524.md)

### B' 実装 — Pro=100/月・Team=Unlimited(fair use)全面整合

変更した 5 ファイル:

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/usage.ts:12` | `team.requestsPerMonth: 100 → 9999` |
| `src/app/page.tsx` | LP 価格テーブル EN/ES + Fair Use 脚注追加 |
| `src/app/terms/page.tsx` | Plans 修正・Fair Use Policy（Section 4）挿入・8 セクション再番号付け |
| `src/app/dashboard/DashboardClient.tsx` | Free→Pro CTA の文言修正 |
| `src/lib/emails.ts` | Pro "unlimited" → 100/month（ウェルカム・トライアル・キャンセルメール） |

- commit: `eb62804`
- 詳細: [`docs/launch/plan-copy-consistency-20260524.md`](plan-copy-consistency-20260524.md)

### R-01・R-02・Team 経路バグ修正

変更した 5 ファイル:

| ファイル | 修正内容 |
|---------|---------|
| `src/app/dashboard/page.tsx` | `plan` カラムを SELECT 追加・subscription prop に `plan` 追加 |
| `src/app/dashboard/DashboardClient.tsx` | Subscription インターフェースに `plan` 追加・価格表示を動的化（Pro=$49/Team=$149） |
| `src/lib/emails.ts` | `sendCancellationEmail` / `sendTrialReminderEmail` に `plan` パラメータ追加 |
| `src/app/api/stripe/webhook/route.ts` | `planFromPriceId` で plan 取得・`sendCancellationEmail` に渡す |
| `src/app/api/cron/trial-reminder/route.ts` | `plan` を SELECT・`sendTrialReminderEmail` に渡す |

- commit: `5af3377`
- 詳細: [`docs/launch/team-path-fixes-20260524.md`](team-path-fixes-20260524.md)

---

## B. 主要な決定

| 決定 | 内容 |
|------|------|
| B' 確定 | Pro = 100 floor plan generations/month（コード現状どおり）、Team = Unlimited（内部上限 9999・fair use 付き）。ユーザー向けには "Unlimited" のみ表示、9999 は非開示。 |
| OI-002 クローズ | 決済は Stripe Checkout ホスト型（Pattern A）。splanai.com のドメイン登録は不要と確定。 |
| R-03 残す方針 | "Priority support" 表記は維持。hello@ 宛メール対応を "priority" として扱う運用で対応（一般的に許容範囲内）。 |
| 9999 番兵値 | Team の内部上限。`Infinity` は JSON.stringify で null になるため不採用。9999 は整数演算・JSON・TypeScript 型すべて安全。 |

---

## C. リポジトリ外の状態（コードに現れないが記録すべき事実）

| 項目 | 状態 |
|------|------|
| OI-005 Anthropic spend limit | オートリロード ON、月間支出上限 **$500** 設定済み → 実質完了。（当初 $200 の想定だったが $500 に設定） |
| Stripe Dashboard — Team price | $149/月であることを Stripe Dashboard で確認要（コード側は `STRIPE_TEAM_PRICE_ID` 環境変数依存。現在確認未了）。 |
| Stripe Dashboard — Apple Pay | `splanai.com` がドメイン登録済みでも無害。Verify 操作は不要だが、実施済みでも問題なし。 |

---

## D. 未解決・要対応（ローンチ前）

### コード確認事項（次セッションで確認推奨）

| # | 確認内容 | 根拠 |
|---|---------|------|
| C-01 | ダッシュボード価格表示 `subscription?.isActive &&` の条件で Free ユーザーには非表示になるか確認（コード上は `isActive: false` の場合に該当 span が出ない。念のため確認。） | `DashboardClient.tsx:372` |
| C-02 | Stripe Dashboard で Team プランの price が `$149/月` か確認 | `stripe.ts:STRIPE_TEAM_PRICE_ID` |

### ローンチ必須タスク（手動・コード外）

| OI | タスク | 状態 |
|----|--------|------|
| OI-006 | Vercel WAF / Firewall rules 設定 | 未着手。`docs/launch/vercel-waf-checklist.md` 参照 |
| OI-011 | PH 提出物 残り: スクリーンショット×5・デモ GIF・Maker's Comment・PH提出スケジュール（PST 00:00） | OGP/meta 部分は完了。残り未了 |
| OI-012 | Stripe Billing Portal: "Cancel at period end" 有効化 | 未着手 |
| OI-013 | splanai@gmail.com 作成 | 未着手 |

### ローンチ当日コードタスク（2026-05-26 JST 17:00）

```
src/components/SocialProofBar.tsx → "🚀 LIVE on ProductHunt — Upvote us today!"
src/components/ProductHuntBadge.tsx → "pre-launch" → "launch-day"
git commit & push origin main
```

---

## E. post-launch 対応事項（今回スコープ外・記録のみ）

| タスク | 内容 |
|--------|------|
| `/s/[slug]` OGP | `generateMetadata` 追加で顧客名・URL を固有化 |
| fallback URL 修正 | `DashboardClient.tsx:62` / `api/share/create:59` の `homeplan-ai.vercel.app` fallback を `splanai.com` に変更 |
| OI-015 | `auth/callback` 旧コード（DEC-009 で廃止決定済みの checkout fetch）の削除 |
| OI-016 | Resend キー一本化 |
| OI-017 | テストアカウント 18 件のクリーンアップ |
| R-01 追加確認 | Dashboard の subscription card が Team ユーザーで $149/month と正しく表示されるか本番 E2E で確認（ステージング環境なし） |
| `@stripe/stripe-js` dead dep | package.json にあるが src/ で import ゼロ。post-launch で削除検討 |

---

## 参照ドキュメント（docs/launch/ 配下）

| ファイル | 内容 |
|---------|------|
| [`ogp-meta-verification-20260524.md`](ogp-meta-verification-20260524.md) | OGP・メタタグ検証レポート |
| [`oi-002-checkout-pattern-verification-20260524.md`](oi-002-checkout-pattern-verification-20260524.md) | OI-002 決済パターン確認（Pattern A 確定） |
| [`api-cost-surface-audit-20260524.md`](api-cost-surface-audit-20260524.md) | API コスト全体像監査 |
| [`plan-usage-limits-audit-20260524.md`](plan-usage-limits-audit-20260524.md) | プラン生成上限監査（不一致の初期検出） |
| [`plan-differentiation-matrix-20260524.md`](plan-differentiation-matrix-20260524.md) | プラン差別化マトリクス |
| [`team-unlimited-scope-20260524.md`](team-unlimited-scope-20260524.md) | Team 無制限化スコープ調査 |
| [`plan-copy-consistency-20260524.md`](plan-copy-consistency-20260524.md) | B' 実装レポート（Pro=100/Team=Unlimited 全面整合） |
| [`team-path-fixes-20260524.md`](team-path-fixes-20260524.md) | R-01・R-02・Team 経路修正レポート |
| [`vercel-waf-checklist.md`](vercel-waf-checklist.md) | OI-006 Vercel WAF 設定手順 |
| [`apple-pay-domain-verification-20260524.md`](apple-pay-domain-verification-20260524.md) | OI-002 前レポート（インフラ確認） |
