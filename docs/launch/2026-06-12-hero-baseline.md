# Hero Motion A案 — ベースライン計測

計測日時: 2026-06-12  
対象: https://splanai.com (本番)  
ツール: Lighthouse CLI 13.4.0 / `--form-factor=mobile`  
状態: HeroPreview 静的モック（変更前）

## Lighthouse モバイル

| 指標 | 値 | スコア |
|---|---|---|
| Performance | 94 | — |
| LCP | 2.6s | 0.87 |
| FCP | 1.1s | 0.99 |
| CLS | 0 | 1.00 |
| TBT | 100ms | 0.98 |
| Speed Index | 3.9s | 0.82 |

LCP要素: `<h1>` テキスト（ヒーロー左カラム）

## Analytics ベースライン

- `cta_click { button: "hero_primary" }`: 実装済み (HomePageClient.tsx line 596)
- `cta_click { button: "nav_cta" }`: 実装済み (line 571)
- CTR比較起点: A案デプロイ日以降

## 不変条件（実装制約）

- h1 を LCP要素のまま維持
- 変更は HeroPreview コンポーネントのみ（line 313-383）
- LCP 2.6s を悪化させない
- prefers-reduced-motion: エンドステート固定

## 実装後（ローカル本番ビルド計測 — デプロイ前）

commit: a8ce84e

| 指標 | 値 | スコア | 変化 |
|---|---|---|---|
| Performance | 95 | — | +1 |
| LCP | 2.9s | 0.81 | ※ローカル（CDNなし）特性 |
| FCP | 0.8s | 1.00 | — |
| CLS | **0** | **1.00** | 維持 ✅ |
| TBT | 30ms | 1.00 | — |
| Speed Index | 2.6s | 0.97 | — |

ローカルLCP=2.9sは本番の2.6sより高いが、CDNキャッシュなしの特性。
CLS=0、h1がLCP要素のまま維持 → 制約クリア。

## Production deploy後（本番計測 — 2026-06-12）

commit: a8ce84e / デプロイ: Vercel main → splanai.com

| 指標 | ベースライン | デプロイ後 | 変化 |
|---|---|---|---|
| Performance | 94 | **99** | +5 ✅ |
| LCP | 2.6s (0.87) | **1.9s (0.98)** | **−0.7s ✅** |
| FCP | 1.1s | 1.4s | — |
| CLS | 0 | **0** | 維持 ✅ |
| TBT | 100ms | 10ms | −90ms ✅ |
| SI | 3.9s | 2.7s | −1.2s ✅ |

→ LCP が Good ゾーン（<2.5s）に入った。制約クリア。**✅ SHIP OK**
