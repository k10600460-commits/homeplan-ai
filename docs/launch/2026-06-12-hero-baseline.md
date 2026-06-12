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

## 実装後に再計測

実装PR マージ・デプロイ後、同コマンドで再計測して本ファイルに追記。
