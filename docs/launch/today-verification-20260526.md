# 本日作業 総点検レポート — 2026-05-26

**作成日**: 2026-05-26  
**作成方法**: git log / コード直接読み取り / npm run lint / MCP 確認済み調査を参照  
**方針**: 推測なし。確認できないものは「未確認」と明記。

---

## サマリー

| 評価 | 件数 |
|------|------|
| ✅ OK | 12 |
| ⚠️ 要対応 | 4 |
| ❌ 欠落・破損 | 0 |
| 未確認 | 2 |

---

## 1. 本日の成果物の棚卸し

### 1-1. 本日のコミット一覧（JST 時刻順）

| ハッシュ | 時刻 | 内容 |
|---------|------|------|
| `bd69386` | 09:48 | fix(emails): reply-to hello@splanai.com を全5通に追加 |
| `4a84ca4` | 11:37 | fix(lp): Hero CTA「Watch demo」→「See how it works」(EN/ES) |
| `f7488ee` | 11:56 | fix(lp): #generate に scroll-mt-24 追加 |
| `c2a652a` | 12:31 | fix(pdf): テキストワードマーク・推定コスト注記・room disclaimer・サマリー行間修正 |
| `8737d6a` | 13:54 | fix(lp): #generate scroll-mt を 64px に調整 |
| `402439e` | 14:11 | fix(pdf): FEATURES 多行折り返し・room disclaimer footer クランプ修正 |
| `be017f7` | 14:30 | fix(pdf): room breakdown と features のページネーション |
| `e0ea742` | 14:47 | fix(pdf): セクション間隔の圧縮 |
| `7ab2553` | 15:02 | fix(pdf): room row pitch 動的計算（1プラン=1ページ保証） |
| `622be22` | 15:16 | fix(pdf): disclaimer 前の stale maybeNewPage(8) 除去 |
| `38b71fe` | 15:54 | feat(launch): PH バッジ LIVE 表示化 |
| `4e5759d` | 17:03 | fix(seo): canonical を LP 専用化・sitemap から /login 除外 |
| `1012aea` | 17:06 | docs(launch): launch-day-log 作成 |
| `27d39c9` | 18:13 | chore: CLAUDE.md 改訂・investigate スキル・launch-day docs 追加 |

**合計**: 14 コミット / working tree クリーン ✅

### 1-2. 本日作成/変更の docs/launch/*.md

| ファイル | サイズ(B) | 評価 |
|---------|----------|------|
| `launch-day-log-20260526.md` | 9,409 | ✅ 実体あり |
| `post-launch-sales-20260526.md` | 16,866 | ✅ 実体あり |
| `outreach-log-table-existence-20260526.md` | 4,073 | ✅ 実体あり |
| `ph-first-comment-claim-check-20260526.md` | 4,690 | ✅ 実体あり |
| `product-facts-for-maker-comment-20260526.md` | 14,880 | ✅ 実体あり |
| `oi013-stripe-verification-20260526.md` | 7,013 | ✅ 実体あり |
| `seo-audit-20260526.md` | 13,814 | ✅ 実体あり |
| `coverage-area-20260526.md` | 8,558 | ✅ 実体あり |
| `payment-methods-status.md` | 3,565 | ✅ 実体あり（本日更新） |

空・スタブファイル: **なし** ✅

---

## 2. CLAUDE.md

| 確認項目 | 結果 |
|---------|------|
| リポジトリ直下に存在するか | ✅ `/CLAUDE.md` 確認済み |
| `## Hard rules` セクション存在 | ✅ 行 47 に存在 |
| `## Build & project layout` セクションが実態で埋まっているか | ✅ 行 64〜 にコマンド・依存・ディレクトリマップ記載済み |

### ⚠️ Pricing 記載と実装の不一致

**CLAUDE.md 記載**（行 20）:
```
- Pro $49/mo: unlimited generations, MLS data via Trestle.
```

**コード実態**（`src/lib/usage.ts:11`）:
```ts
pro: { requestsPerMonth: 100, label: 'Pro Plan ($49/mo)' },
```

**不一致**: CLAUDE.md は「unlimited」と記載しているが、コードは **100 回/月** に制限されている。  
`session-checkpoint-20260524.md §B` に "B' 確定: Pro = 100 floor plan generations/month（コード現状どおり）" と記録があり、コードが正しい。

**推奨対応**: CLAUDE.md の Pricing を以下に修正:
```
- Pro $49/mo: 100 generations/month, MLS data via Trestle.
```

---

## 3. investigate スキル

| 確認項目 | 結果 |
|---------|------|
| `.claude/skills/investigate/SKILL.md` が存在する | ✅ 確認済み |
| frontmatter に `name: investigate` がある | ✅ 確認済み |
| frontmatter に `description:` がある | ✅ 確認済み |
| frontmatter に `argument-hint:` がある | ✅ 確認済み |
| `/investigate` が Claude Code コマンド一覧に出る | **未確認** — Claude Code ランタイムのスキャン結果はコードから確認不可。実際に `/` を入力してリストに出るかユーザーが確認要。 |

---

## 4. SEO 修正（本日実施分）

### M-2: canonical を LP 専用化

| 確認内容 | 結果 |
|---------|------|
| `src/app/layout.tsx` に `alternates: { canonical }` がないか | ✅ なし（`metadata` オブジェクトに canonical キー不在を確認） |
| `src/app/page.tsx` に LP 専用 canonical があるか | ✅ 行 5: `alternates: { canonical: "https://splanai.com" }` |
| `src/app/login/page.tsx` に canonical がないか | ✅ なし（grep 結果ゼロ） |
| `src/app/upgrade/page.tsx` に canonical がないか | ✅ なし（grep 結果ゼロ） |

### M-3: sitemap から /login 除外

| 確認内容 | 結果 |
|---------|------|
| `src/app/sitemap.ts` に `/login` エントリがないか | ✅ sitemap は `/` のみ |

---

## 5. ProductHunt 関連

| 確認内容 | 結果 |
|---------|------|
| `HomePageClient.tsx` で `<ProductHuntBadge state="launch-day">` を使用 | ✅ 行 551 確認済み |
| `ProductHuntBadge` launch-day の href | ✅ `https://www.producthunt.com/products/splanai?launch=splanai` |
| `SocialProofBar` の文言 | ✅ "🚀 LIVE on ProductHunt — Upvote us today!" |
| `SocialProofBar` の href | ✅ `https://www.producthunt.com/products/splanai?launch=splanai` |
| 全 PH href の統一 | ✅ `pre-launch` / `launch-day` / `top-product` 全 state で同一 URL |

**ライブ表示**: splanai.com でのバッジ・テキストの目視確認はユーザーが実施要。コード上は正しい。

---

## 6. ビルド健全性

```
npm run lint: ✖ 23 problems (13 errors, 10 warnings)
```

### ⚠️ lint エラーの評価

**本日変更した src/ ファイルがエラーを新規導入したか**: **No**

エラーが存在するファイル:
- `DashboardClient.tsx` — 最終変更: `5af3377`（2026-05-24）
- `invite/page.tsx` — 最終変更: 05-24 以前
- `upgrade/page.tsx` — 最終変更: 05-24 以前
- `SharePortalClient.tsx` 等 — 本日未変更

**結論**: 13 エラーはすべて **本日より前から存在する既存エラー**。本日のコミットが新規エラーを導入した証跡なし。

**エラー種別**（参考）:
- `react-hooks/rules-of-hooks`: setState を effect 内で同期呼び出し（DashboardClient, invite）
- `@next/next/no-html-link-for-pages`: `<a>` タグで内部遷移（upgrade, DashboardClient, 他）
- `react/no-unescaped-entities`: JSX 内の `"` `'` のエスケープ漏れ

**推奨対応**: ローンチ後タスクとして既存 lint エラーを解消する（critical ではないが放置すると増加リスク）。

---

## 7. 記録と決定の整合性

### x-content-agent.md と「X はチャネルにしない」の関係

**決定記録**（`launch-day-log-20260526.md §6`）:
- "ホームビルダーは PH にいない"
- "Hermes Agent: 非採用（顧客が X にいない / 運用負荷）"

**`CLAUDE.md §Customer & go-to-market`**:
- "Home builders are NOT on Product Hunt or X."

**`agents/x-content-agent.md` の目的**（コード確認済み）:
- @SplanAI アカウントの投稿・返信・DM の**下書き生成**
- "最終投稿判断は常に Shuraemon。Agent は draft までで止まる"

**評価**: ⚠️ 表面上の矛盾があるが、内容確認で本質的矛盾は**なし**。

- Hermes 非採用はビルダー向け X DM の**自動送信**の拒否（顧客が X にいない）
- `x-content-agent.md` は @SplanAI の**ブランド運用・SEO・信頼性**目的で人間承認制
- CLAUDE.md の "X is not a customer-acquisition channel" と整合

**推奨対応**: `x-content-agent.md` の冒頭に「用途: SEO バックリンク / ブランド / 信頼性。ビルダーへの顧客獲得チャネルとして使用しない」と一行追記し明確化すること（⚠️ 低優先）。

### CLAUDE.md ディレクトリマップの未記載ファイル

| ファイル | 状態 |
|---------|------|
| `agents/x-content-agent.md` | ⚠️ CLAUDE.md ディレクトリマップに未記載 |
| `scripts/x-analytics-sync.ts` | ⚠️ CLAUDE.md ディレクトリマップに未記載 |

**推奨対応**: CLAUDE.md の `## Build & project layout` に以下を追記:
```
agents/x-content-agent.md  ← @SplanAI X account draft agent
scripts/x-analytics-sync.ts ← X post metrics sync (own posts only)
```

---

## 総評

| # | 項目 | 評価 | 推奨対応 |
|---|------|------|---------|
| 2 | CLAUDE.md Pricing（Pro unlimited → 100/月） | ⚠️ | CLAUDE.md 行 20 を修正 |
| 6 | lint 13 エラー（既存・本日未導入） | ⚠️ | ローンチ後タスクとして解消 |
| 7a | x-content-agent.md に目的注記なし | ⚠️ 低優先 | 冒頭に 1 行追記 |
| 7b | scripts/x-analytics-sync.ts・agents/x-content-agent.md が CLAUDE.md 未記載 | ⚠️ 低優先 | ディレクトリマップに追記 |
| 3 | /investigate のコマンド一覧表示 | 未確認 | ユーザーが `/` 入力で確認 |
| 5 | PH バッジのライブ表示 | 未確認 | splanai.com を目視確認 |

**❌ 欠落・破損: なし**  
**本日のコードコミットに起因する新規バグ・エラー: なし**  
**最優先の対応**: CLAUDE.md Pricing の "unlimited" → "100/month" 修正（根拠: `usage.ts:11`）。

---

*作成: 2026-05-26 / git log 14コミット・lint・コード直接読み取りで検証*
