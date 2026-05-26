# ProductHunt バッジ LIVE 表示化 — 2026-05-26

## 調査結果

### SocialProofBar (`src/components/SocialProofBar.tsx`)
- **表示制御**: 無条件レンダリング（フラグなし）。`src/app/page.tsx:584` に配置済み
- **変更前テキスト**: "Launching May 26 on ProductHunt"（リンクなし）
- **変更前 URL**: なし（リンク未設定）

### ProductHuntBadge (`src/components/ProductHuntBadge.tsx`)
- **表示制御**: 無条件レンダリング（フラグなし）。`src/app/page.tsx:551` に配置済み
- **変更前 state**: `"pre-launch"` → 青いバッジ "🚀 Launching on ProductHunt · May 26"
- **変更前 URL**: `https://www.producthunt.com/posts/splanai`（全 state 共通）

---

## 変更内容

### 1. `src/app/page.tsx` (line 551)
```diff
- <ProductHuntBadge state="pre-launch" lang={lang} />
+ <ProductHuntBadge state="launch-day" lang={lang} />
```

### 2. `src/components/ProductHuntBadge.tsx`
全 state の `href` を一括変更:
```diff
- href="https://www.producthunt.com/posts/splanai"
+ href="https://www.producthunt.com/products/splanai?launch=splanai"
```
（3箇所: `top-product` / `launch-day` / `pre-launch`）

### 3. `src/components/SocialProofBar.tsx`
テキスト更新 + リンク追加:
```diff
- <span className="flex items-center gap-1.5 text-xs text-slate-400">
-   ...
-   "Launching May 26 on ProductHunt"
- </span>
+ <a
+   href="https://www.producthunt.com/products/splanai?launch=splanai"
+   target="_blank"
+   rel="noopener noreferrer"
+   className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
+ >
+   ...
+   "🚀 LIVE on ProductHunt — Upvote us today!"
+ </a>
```

---

## 最終表示状態

| コンポーネント | 表示文言 | リンク先 | 新規タブ |
|---|---|---|---|
| `ProductHuntBadge` | 🚀 LIVE on ProductHunt — Upvote us today! | https://www.producthunt.com/products/splanai?launch=splanai | ✅ |
| `SocialProofBar` | 🚀 LIVE on ProductHunt — Upvote us today! | https://www.producthunt.com/products/splanai?launch=splanai | ✅ |

---

## 確認事項
- TypeScript 型チェック: エラーなし (`tsc --noEmit`)
- 条件分岐・env var フラグなし → 変更即時有効
