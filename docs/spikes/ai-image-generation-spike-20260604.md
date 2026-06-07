# AI 画像生成スパイク — 技術調査・決定ドキュメント
**日付:** 2026-06-04  
**ブランチ:** `spike/ai-image-generation-20260604`  
**目的:** 外観ヒーロー画像（Path A）の実測コスト・レイテンシ・品質を検証し、go/no-go と推奨アーキテクチャを決定する。

---

## 前提：統合ポイントの確認

| 項目 | 実コード |
|-----|---------|
| ConceptImage コンポーネント | `src/app/s/[slug]/SharePortalClient.tsx:303` |
| imageUrl 優先ロジック | `src/lib/concept-style-image.ts:22-24` — `if (imageUrl) return imageUrl` |
| Plan インターフェース | `SharePortalClient.tsx:100` — `imageUrl?: string \| null` |
| 差し込みポイント | plan オブジェクトの `imageUrl` に URL/Data URL を入れるだけ |
| 現状のフォールバック | `public/concept-styles/{style}.jpg`（プレースホルダー） |

AI 画像は `imageUrl` に Supabase Storage URL を入れれば既存コンポーネントがそのまま表示する。**results ページは現時点で imageUrl 未対応**（SharePortalClient のみ対応済み）。

---

## API 候補比較表

| 項目 | gpt-image-1-mini (OpenAI) | Flux.1 Schnell (Replicate) | Flux.1 Schnell (fal.ai) |
|-----|--------------------------|---------------------------|------------------------|
| コスト/枚 (1024×1024) | $0.005 (low) / $0.020 (medium) | $0.003 | $0.003/megapixel |
| 予想レイテンシ p50 | 8–15s | 4–8s | 3–6s |
| 予想レイテンシ p95 | 20–30s | 12–20s | 10–18s |
| 商用ライセンス | ✅ (OpenAI API ToS) | ✅ (Apache 2.0) | ✅ (Apache 2.0) |
| Vercel serverless 相性 | ✅ 同期 REST | ⚠ Prefer:wait で疑似同期 (60s上限) | ✅ 同期 REST |
| SDK / 呼び出し難易度 | ✅ 簡単（openai pkg or fetch） | ⚠ polling 実装必要（Prefer:wait で軽減） | ✅ 簡単（fal-js SDK or fetch） |
| 建築写真の品質評判 | 高（テキスト混入少・安定） | 高（高速・アーティスティック） | 同上（Flux Schnell） |
| 非推奨/廃止リスク | gpt-image-1 は 2026-10-23 廃止予定（mini は継続） | なし | なし |
| 実測コスト (本スパイク) | _Phase 2 で記入_ | _Phase 2 で記入_ | — |
| 実測 p50 latency | _Phase 2 で記入_ | _Phase 2 で記入_ | — |

---

## スパイク実行手順（Phase 2）

### 1. API キー取得先

| 変数名 | 取得先 | 想定コスト（7枚） |
|--------|--------|-----------------|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | 7 × $0.005 = **$0.035** (low quality) |
| `REPLICATE_API_KEY` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) | 7 × $0.003 = **$0.021** |

### 2. `.env.local` に追加（コミットしないこと）

```
OPENAI_API_KEY=sk-proj-...
REPLICATE_API_KEY=r8_...
```

### 3. スクリプト実行コマンド

```bash
# ── Phase 2A: まずドライラン（プロンプト確認、API 呼び出しなし）
npx tsx scripts/spike-image-gen.ts --api openai --dry-run
npx tsx scripts/spike-image-gen.ts --api replicate --dry-run

# ── Phase 2B: OpenAI で 7スタイル生成（$0.035 程度）
npx tsx scripts/spike-image-gen.ts --api openai --quality low --limit 7

# ── Phase 2C: Replicate で 7スタイル生成（$0.021 程度）
npx tsx scripts/spike-image-gen.ts --api replicate --limit 7

# 生成画像は ./spike-output/ に保存される
# JSON 集計は ./spike-output/summary.json
```

### 4. 出力ファイル

```
spike-output/
  openai_craftsman_1.jpg
  openai_modern-farmhouse_2.jpg
  ...（7ファイル）
  replicate_craftsman_1.jpg
  ...（7ファイル）
  summary.json   ← style・cost_usd・latency_ms・ok の全結果
```

---

## Phase 2 実測結果（2026-06-06 CC試写スパイク）

スクリプト: `scripts/spike-phase2.ts` / ブランチ: `spike/ai-image-generation-20260604`

### Stage 1 — gpt-image-1-mini / low / 1536×1024（当たり付け、6スタイル）

| スタイル | ok | cost_usd (est) | latency_ms | 品質メモ |
|---------|-----|---------------|-----------|---------|
| Modern Farmhouse | ✅ | $0.030 | 13,190 | 完璧。白ボード&バッテン・黒屋根・ポーチ |
| Craftsman | ✅ | $0.030 | 11,919 | 傑出。木目サイディング・石台基・深い庇 |
| Transitional | ✅ | $0.030 | 13,089 | 良好。石+グレー、対称エントリー |
| Ranch | ✅ | $0.030 | 13,379 | 可。単層・石煉瓦・ガレージ。やや平坦 |
| Contemporary Modern | ✅ | $0.030 | 13,943 | 鮮明。フラット屋根・大開口・木材パネル |
| Colonial | ✅ | $0.030 | 15,663 | 可。赤レンガ・ドーマー・対称構成 |
| **合計/平均** | **6/6** | **$0.180** | **13,530** | |

### Stage 2 — gpt-image-2 / medium / 1536×1024（本番3スタイル品質判定）

| スタイル | ok | cost_usd (est) | latency_ms | 品質メモ |
|---------|-----|---------------|-----------|---------|
| Modern Farmhouse | ✅ | $0.100 | 66,947 | **A+** Zillow リスティング写真レベル |
| Craftsman | ✅ | $0.100 | 47,671 | **A+** 石台基・木材ドア・庇の影まで写実的 |
| Transitional | ✅ | $0.100 | 46,370 | **A** 石+グレーサイディング・整った郊外住宅 |
| **合計/平均** | **3/3** | **$0.300** | **53,663** | |

**スパイク総コスト: $0.48（予算 $5 に対して余裕あり）**

---

## コンセプト → プロンプト変換（スクリプト実装済み）

入力フィールド: `style`, `stories`, `squareFootage`, `features[]`

```
Professional architectural exterior photograph of a {stories}-story {squareFootage} sq ft {style} style residential home.
Architectural features: {features joined by ", "}.
Setting: suburban US neighborhood, afternoon golden-hour light, manicured front lawn, clear sky, mature trees flanking the house.
Camera: wide-angle street-level view, sharp focus, photorealistic.
No people, no cars in foreground, no text, no watermarks.
```

6スタイルのプロンプト品質チェック（dry-run で事前確認）:
- Craftsman: _未実測_
- Modern Farmhouse: _未実測_
- Contemporary Modern: _未実測_
- Traditional Colonial: _未実測_
- Transitional: _未実測_
- Hill Country Traditional: _未実測_
- Prairie Modern: _未実測_

---

## 単価インパクト試算（1案あたり）

現在の generate コスト: **約 $0.03/案**（Haiku × 3 プラン分）

| 構成 | 画像コスト | 合計/案 | 倍率 |
|-----|----------|--------|-----|
| 画像なし（現状） | $0.00 | $0.03 | 1× |
| OpenAI mini-low × 3枚 | 3 × $0.005 = $0.015 | $0.045 | 1.5× |
| OpenAI mini-medium × 3枚 | 3 × $0.020 = $0.060 | $0.090 | 3× |
| Replicate Flux.1 Schnell × 3枚 | 3 × $0.003 = $0.009 | $0.039 | 1.3× |
| Replicate + キャッシュ（再生成回避） | ≈ 0.5倍（同スタイルはキャッシュ） | $0.034 | 1.1× |

→ **Replicate Flux.1 Schnell が最小コストインパクト（+30%）**。Free プランを含むすべてのユーザーへの提供にも耐えうる水準。

---

## 推奨アーキテクチャ（確定: 2026-06-06）

### 採用モデル（確定）
- **採用**: `gpt-image-2` / medium — 品質テスト合格・OpenAI API（既存スタックと統一）
- ~~第一候補: Replicate Flux.1 Schnell~~ — 品質未検証、今回スパイクでは実施せず
- ~~第二候補: gpt-image-1-mini (low)~~ — Stage 1 で品質確認済だが gpt-image-2 が圧勝

### 同期 vs 非同期
- **推奨: 非同期（テキスト先行・画像後追い）**
  - テキスト生成（現在 ~15-30s）を先にユーザーに見せる → 画像は非同期でバックグラウンド生成
  - plan_generations の `plans` jsonb に `imageUrl: null` で初期保存 → 画像完了後に UPDATE
  - フロントは `imageUrl === null` のとき concept-style プレースホルダーを表示、完了後に差し替え
  - Vercel 60s タイムアウトを超えないためにも非同期が必須（Replicate の場合は特に）

### キャッシュ設計
- **キャッシュキー**: `{style}_{squareFootage_bucket}_{stories}` の SHA-256（features は変動が大きいため除外 or ソート後に含める）
- **保存先**: Supabase Storage（`plan-images` バケット）
- **再利用**: 同じキャッシュキーの URL が存在すれば再生成しない（=API コールしない）
- **TTL**: 90日（建築スタイルは短命なトレンドに依存しない）

### 失敗モード と フォールバック
| 失敗パターン | 頻度（予想） | フォールバック |
|------------|------------|-------------|
| テキスト（文字）が画像に混入 | 低（prompt で "No text" を明示） | concept-style プレースホルダー |
| コンテンツフィルタ誤検知 | 低（住宅外観は安全なコンテンツ） | リトライ1回 → フォールバック |
| API タイムアウト | 中（Replicate p95 は 20s 超えることも） | 非同期設計で緩和、フォールバック |
| レート制限 | 低（スパイクレベルでは発生しない） | Exponential backoff × 2 → フォールバック |

---

## go/no-go 判定（2026-06-06 確定）

### ✅ GO — gpt-image-2 / medium を本番採用

| 判定基準 | 結果 |
|---------|------|
| 写実・買い手向け提案レベル | ✅ Zillow/Realtor.com リスティング写真と区別不能 |
| 建築的破綻なし（歪み・溶け・非現実構造） | ✅ 壁直線・パース正常・欠陥なし |
| 様式制御できる（追従する） | ✅ Farmhouse/Craftsman/Transitional が明確に別物 |
| 3案がひと揃いに見える | ✅ 同昼間・郊外・同品質感で統一感あり |
| バナークロップ耐性（2.87:1 = 1536×535px） | ✅ 中央クロップで家が完全に収まる。空と芝が適切な余白 |
| 商用ライセンス | ✅ OpenAI API ToS で商用利用可 |

**採用スペック:**
- **モデル**: `gpt-image-2`
- **クオリティ**: `medium`
- **サイズ**: `1536x1024`
- **プロンプト**: `scripts/spike-phase2.ts` の `buildPrompt()` 参照
- **コスト**: ~$0.10/枚 × 3枚 = **$0.30/セッション**（テキスト生成 $0.03 の約10倍）
- **レイテンシ**: 平均 ~54s/枚 → **非同期設計が必須**
  - テキスト生成を先にユーザーに表示 → 画像はバックグラウンドで生成 → `imageUrl` 完了後に差し替え

### Path B（間取り忠実な画像）必要か？
- 「契約前の買い手に見せる外観ヒーロー画像」の用途なら雰囲気画像（Path A）で十分
- Path B（ControlNet や ArchitecturalPlan→画像）は実装難度が大幅に上がり、コスト・レイテンシとも不利
- **推奨**: まず Path A を本番投入し、ユーザーフィードバックで Path B の必要性を検証

---

## 参照ファイル

| ファイル | 内容 |
|---------|------|
| `scripts/spike-image-gen.ts` | Phase 1 スパイクスクリプト（比較調査・ドキュメント用） |
| `scripts/spike-phase2.ts` | Phase 2 CC試写スクリプト（2段階・go/no-go 判定用） |
| `/tmp/spike-out/summary.json` | Phase 2 実測結果 JSON（ローカルのみ・コミットしない） |
| `/tmp/spike-out/*.png` | Phase 2 生成サンプル画像 6+3+1枚（ローカルのみ） |
| `src/lib/concept-style-image.ts` | imageUrl 優先ロジック |
| `src/app/s/[slug]/SharePortalClient.tsx:303` | ConceptImage コンポーネント |
