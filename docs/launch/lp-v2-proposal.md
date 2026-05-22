# SplanAI LP v2 — Phase 1 Proposal

**Branch:** `feat/lp-v2-redesign-phase1-20260521`
**Date:** 2026-05-21
**Status:** Phase 1 implemented (P0 only). Phase 2 deferred post-launch.

---

## A. Screen Studio からの学び

| 要素 | Screen Studio での実装 | SplanAI への適用可能性 |
|------|----------------------|---------------------|
| インタラクティブ demo widget | Cursor/Background/Padding をリアルタイムで切り替え | Hero の HeroPreview にタブ切り替え（Lot input → Generating → Results）— P2 |
| 巨大タイポグラフィ + 余白 | h1 が viewport の 40% を占める、下に何もない | 現状の h1 (text-6xl) は良い出発点。余白を 20% 増やすと効果的 — P1 |
| ソーシャルプルーフ (stripe/Vercel/Google 等) | 企業ロゴバー（Powered by ではなく "Used by"） | 現状は "Powered by" 技術バー。User ソーシャルプルーフバーを追加 — P0 ✅ |
| 実例ショーケース "Made with Screen Studio" | 実際のユーザー動画が並ぶギャラリー | "Floor plans built with SplanAI" カルーセル — P1 |
| 1 セクション 1 メッセージ | 各セクションに 1 つのアイデアのみ | 現状は Pain → Diff → Mission が連続しすぎ — P1 リファクタ |

---

## B. @DesignByMaeL Advisor Feedback の本質

### 3 つの核心的指摘

1. **ポジショニング自動分類リスク**
   - "AI sales rep" / "sales tool" という言葉が脳内で CRM/sales tooling として分類される
   - 最初の 10 秒で形成された印象は、その後のセクション全体の解釈フレームになる

2. **"operational relief for overloaded builders" という新しい emotional anchor**
   - ターゲット (小規模 builder) は既に過負荷状態 → 「もっと売れる」より「今の苦痛から解放される」が刺さる
   - Hero で見せるべき感情: 「signed lead を取りこぼす不安」→「30秒で解決される relief moment」

3. **Screenshot sequencing の決定性**
   - gallery (visual 並び順) は、onboarding 前のユーザーが product を解釈する fast pattern matching に直結
   - Plan 01/02/03 の AI output を最初に見せると「プラン生成ツール」と分類される
   - 隣地データ (Schools / Safety / Avg Rent) を最初に見せると「賢いアシスタント」と分類される

---

## C. 現状 SplanAI LP セクション評価

| # | セクション | 現状評価 | 自動分類リスク | v2 方針 |
|---|-----------|---------|-------------|--------|
| 1 | Nav | 良好。シンプルで迷子にならない | なし | Keep |
| 2 | Hero | headline は "relief" 系で良い。Hero Preview の **visual 順序** が問題 | **⚠️ 高**: Plan カードが最初 → CRM/sales AI と分類 | **改善: visual 順序を反転** ✅ Phase 1 完了 |
| 3 | Trust Bar ("Powered by") | 技術バーはある。ユーザー社会的証明なし | 低 | **Social Proof Bar を追加** ✅ Phase 1 完了 |
| 4 | Generate Form | 早すぎる位置に Form がある。Pain section より前 | 低 | P1 で Pain → Form の順に入れ替え検討 |
| 5 | Pain Points ("Sound familiar?") | 良い内容。だが Form の後に来る（既に離脱後） | 中: 読まれないリスク | P1: Form の前に移動 |
| 6 | How It Works | 3-step は明快。inline demo も visual 順序問題 | **⚠️ 中**: Plan カードが先 → AI plan generator と分類 | **改善: visual 順序を反転** ✅ Phase 1 完了 |
| 7 | Differentiators | `t.diff.sub` = "SplanAI is a sales tool" — これが分類を固着させる | **⚠️ 高**: "sales tool" 明言 | P1: copy を "your edge on every site visit" 等に変更 |
| 8 | Mission | "sales layer between your lot and the signed contract" — 良い表現 | 低 | Keep |
| 9 | Pricing | 明確。3-tier は標準的 | なし | Keep |
| 10 | FAQ | 良い内容。MLS compliance も説明 | なし | Keep |
| 11 | Security | あって良いが late | なし | Keep |
| 12 | Testimonials | 実名なし (James R. 等) は信頼度低め | 中 | P1: photo avatar、もしくは beta user 証言に変換 |
| 13 | CTA Banner | 良い | なし | Keep |

---

## D. 優先度付き実装リスト

| Priority | 要素 | 実装難易度 | 推定工数 | Phase | 状態 |
|----------|------|-----------|---------|-------|------|
| 🔴 P0 | Social Proof バー (builders in TX/FL/CA/AZ) | 低 | 30分 | 1 | ✅ 完了 |
| 🔴 P0 | ProductHuntBadge component 化 (3 states) | 低 | 15分 | 1 | ✅ 完了 |
| 🔴 P0 | Screenshot sequencing 見直し (Hero + How It Works) | 低 | 30分 | 1 | ✅ 完了 |
| 🟡 P1 | Pain section を Form より前に移動 | 中 | 45分 | 2 | 未着手 |
| 🟡 P1 | Differentiators の copy 変更 ("sales tool" → relief 系) | 低 | 20分 | 2 | 未着手 |
| 🟡 P1 | Testimonials に avatar photo を追加 (Unsplash) | 低 | 30分 | 2 | 未着手 |
| 🟡 P1 | "Floor plans built with SplanAI" 実例ギャラリー | 中 | 2-3時間 | 2 | 未着手 |
| 🟡 P1 | 巨大タイポグラフィ + Hero 余白増加 (16% → 20%) | 中 | 1-2時間 | 2 | 未着手 |
| 🟢 P2 | Hero demo ウィジェット (タブ切り替え) | 高 | 4-6時間 | post-launch | 未着手 |
| 🟢 P2 | SEO structured data (FAQ, Product schema) | 中 | 1-2時間 | post-launch | 未着手 |

---

## E. Phase 2 コンポーネント設計

### E1. TestimonialCard (P1)
```tsx
// src/components/TestimonialCard.tsx
interface TestimonialCardProps {
  name: string;
  role: string;
  text: string;
  stars: number;
  avatarUrl?: string;    // Unsplash or real user photo
  verified?: boolean;    // beta user verified badge
}
```

### E2. PlanGallery (P1 — "Built with SplanAI")
```tsx
// src/components/PlanGallery.tsx
// Shows 6-9 sample floor plans as a masonry/carousel grid
// Props: plans: { title, sqft, style, imageUrl }[]
// Swipeable on mobile, auto-scrolling on desktop
```

### E3. HeroDemoWidget (P2)
```tsx
// src/components/HeroDemoWidget.tsx
// Interactive tabbed preview:
// Tab 1: "Builder enters lot" (form state)
// Tab 2: "AI generating..." (loading state with progress)
// Tab 3: "Client views results" (output state)
// Props: initialTab?: 0|1|2; autoPlay?: boolean; interval?: number
```

### E4. SectionDivider (P1 — Screen Studio style)
```tsx
// src/components/SectionDivider.tsx
// Subtle gradient divider between dark/light sections
// Props: from: 'dark'|'light'; to: 'dark'|'light'
```

---

## F. 競合比較

| 観点 | SplanAI (現状) | Screen Studio | CoPilot (AI CRM) |
|------|---------------|--------------|-----------------|
| Hero の emotional hook | "Show clients their dream home" ← relief 系で良い | "Screen recording for pros" — clear job-to-be-done | "Close more deals" ← 完全に sales framing |
| First visual | Plan cards (AI output) — CRM 誤分類リスク | 実際の recording が動いている — product itself | Dashboard → "pipeline" 感が強い |
| Social proof | 技術バーのみ | 企業ロゴ (Stripe/Vercel 等) | G2 レビュー数 |
| CTA | "Generate Plans Free →" ← 良い | "Try Screen Studio Free" | "Book a Demo" ← enterprise 向け感 |
| 1 section 1 message | ✗ Pain/Diff/Mission が連続 | ✅ 各 section が独立 | △ |

---

## G. Phase 1 実装サマリー

### 変更ファイル
- `src/components/ProductHuntBadge.tsx` — 新規作成。3 state (pre-launch / launch-day / top-product) に対応
- `src/components/SocialProofBar.tsx` — 新規作成。beta users の地域的広がりを示す
- `src/app/page.tsx` — 3 箇所変更:
  1. ProductHuntBadge コンポーネント import・使用（旧 inline badge を置き換え）
  2. SocialProofBar を Hero 直後に追加
  3. HeroPreview と How It Works demo の visual 順序を反転（neighborhood data → mortgage → plans）

### Before / After: Hero Preview
```
Before: [Plan 01] [Plan 02] [Plan 03]  ← "AI plan generator" と分類される
         [Schools][Safety][AvgRent]
         [Mortgage estimate]

After:  [Schools][Safety][AvgRent]     ← "賢いアシスタント" と分類される
         [Mortgage estimate]
         [Plan 01] [Plan 02] [Plan 03]  ← output として後置
```

### Before / After: How It Works demo
```
Before: [Plan 1] [Plan 2] [Plan 3]     ← output first
         [Schools][Safety][Grocery][Rent]
         [Mortgage]

After:  [Schools][Safety][Grocery][Rent] ← context first
         [Mortgage]
         [Plan 1] [Plan 2] [Plan 3]       ← output after
```

---

*Generated: 2026-05-21 | Branch: feat/lp-v2-redesign-phase1-20260521*
