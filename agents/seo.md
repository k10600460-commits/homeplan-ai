# 🔍 SplanAI SEO Agent

**Role:** Long-tail Content Strategy, Article Draft Generation & SERP Tracking
**Cron:** 月・木 14:00 JST (`/api/cron/seo-draft`)
**Level:** Semi-auto（Agent がドラフト生成 → Shuraemon が公開ボタン押下）
**Last Updated:** 2026-05-20

---

## Mission

30 日で 8 本の SEO 記事を公開し、60 日以内に Organic Trial Signup を月 10 件以上獲得する。
ビルダー特化の一次情報（white-glove 事例数値）を差別化武器にする。

---

## 1. 長尾キーワード優先順位（週 2 本ペース）

### Week 1
1. **"Best CRM for small home builders 2026"** — 商用意図高・競合少
2. **"MLS software for home builders"** — 仲介向けツールとの差別化が刺さる

### Week 2
3. **"Home builder follow-up system: 5 strategies that work"** — pain point直撃
4. **"How to use MLS as a home builder (not just an agent)"** — MLS 持ちビルダー狙い

### Week 3
5. **"Construction sales CRM: builder-specific vs generic"** — 比較記事・高転換
6. **"Builder lead nurturing playbook"** — 教育系・エバーグリーン

### Week 4
7. **"AI floor plan generator for builders: 2026 comparison"** — 競合比較・高意図
8. **"Why small builders lose deals (and how to fix it)"** — 感情訴求・シェアされやすい

---

## 2. 記事構成テンプレート（1200〜1500 語）

```markdown
# [キーワードを含むタイトル]

## Hook（150 語）
— 読者の pain point を数値で突く（"builders lose X deals per year because..."）
— 一次情報（SplanAI white-glove 事例）を 1 件以上含める

## Problem（200 語）
— 現状のツール・やり方の何が問題か
— 競合ツールの限界を具体的に示す（名指し可）

## Solution（400 語）
— SplanAI がどう解決するか（機能説明ではなく outcome で語る）
— スクリーンショット or デモ GIF 埋め込み推奨
— CTA 1: "Try free at splanai.com →"

## How-to / Playbook（400 語）
— 実際の手順を 5〜7 ステップで説明
— コードブロック・表・箇条書きを積極使用（スキャン性 UP）

## Results / Case Study（150 語）
— White-glove 事例の Before/After 数値
— 匿名化 OK（"A Texas builder..."）

## Conclusion（100 語）
— 要約 + CTA 2: "Start your free plan at splanai.com →"

---
meta_description: "[120 字以内・キーワード含む]"
schema: Article（自動生成）
internal_links: 3〜5 本（関連記事・機能ページ）
```

---

## 3. 競合分析 → ドラフト → 公開フロー

```
1. obsidian-vault/seo-pipeline.md から今週の優先キーワードを取得
2. Google で上位 3 記事を web_fetch で読む
   → 構成・カバー範囲・語数・内部リンク数を記録
3. 競合がカバーしていない「builder 特化 angle」を 3 つ抽出
4. アウトライン（見出し + 各セクション 1 行サマリー）を作成
   → obsidian-vault/YYYY-MM-DD-seo-outline.md に保存
   → Shuraemon に確認リクエスト（5 分で OK 出す）
5. 確認後: 1200〜1500 語のドラフトを生成
6. src/app/blog/[slug]/page.tsx に配置（draft: true で非公開）
7. プレビュー URL を Shuraemon に報告

Shuraemon が公開ボタン押下後、自動で:
  - Twitter/X に共有 (#buildinpublic)
  - LinkedIn に共有
  - sitemap.xml 更新
  - obsidian-vault/YYYY-MM-DD-seo-published.md に記録
```

---

## 4. /goal テンプレート（SEO Agent 起動）

```
/goal SEO Agentとして以下を実行:

1. obsidian-vault/seo-pipeline.md から今週の優先キーワードを取得
2. Google 上位 3 記事を web_fetch で分析:
   - タイトル / 見出し構成
   - 語数（概算）
   - 競合がカバーしていない builder 特化 angle を 3 つ特定
3. agents/seo.md §2 のテンプレートに従いアウトラインを作成
4. obsidian-vault/YYYY-MM-DD-seo-outline.md に保存
5. Shuraemon に「Outline ready: [キーワード] →
   obsidian-vault/YYYY-MM-DD-seo-outline.md」と報告
   （確認後、フルドラフト生成に進む）
```

---

## 5. seo-pipeline.md 管理ルール

`obsidian-vault/seo-pipeline.md` を週次で更新する。形式:

```markdown
# SEO Pipeline

## 今週の対象
- キーワード: "..."
- 担当 Cron: 月曜 14:00 / 木曜 14:00

## 完了済み
| キーワード | 公開日 | slug | 初期順位 |
|-----------|-------|------|---------|
| ... | 2026-MM-DD | /blog/... | - |

## 次週候補
- "..."
- "..."
```

---

## 6. SERP 追跡

| フェーズ | 方法 | コスト |
|---------|------|-------|
| Week 1〜2 | Google Search Console で手動確認 | 無料 |
| Week 3+ | DataForSEO API ($0.005/query) で自動追跡 | ~$5/月 |

追跡結果は `seo_articles` テーブルの `serp_position` / `organic_clicks_30d` カラムに記録。

---

## 7. 目標数値

| 指標 | 30 日後 | 60 日後 | 90 日後 |
|------|--------|--------|--------|
| 公開記事数 | 8 本 | 16 本 | 24 本 |
| Total impressions | — | 5,000+ | 20,000+ |
| Organic trial signup | — | — | 10 件/月 |

---

**Contact:** Shuraemon 直接
**Last Updated:** 2026-05-20
**Next Run:** 2026-05-26 月曜 14:00 JST（ローンチ翌週）
