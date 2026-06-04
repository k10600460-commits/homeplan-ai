# LP コピー修正 3 件
**日付:** 2026-06-04  
**ブランチ:** `fix/lp-mls-copy-zoning-rate-20260604`  
**対象ファイル:** `src/app/HomePageClient.tsx`（1ファイルのみ）

---

## 修正1：streetHint の "coming soon" 削除

### 背景
住所欄ヘルパーテキストが `"Optional — adds lot size & zoning data (coming soon)"` と表示されており、「住所を入力するとlot size/zoningが取得される機能が coming soon」という誤解を与えていた。

実態確認結果：
- 住所フィールド（`street`）は `generate/route.ts` で `validateGenerateInput` に渡されず、lot size/zoning の直接取得には使われていない。
- MLS 経由の lot size / zoning 反映は G-MLS-02 で実装済み（Pro/Team ユーザーが MLS 接続後に Listing # から Fetch した場合）。
- Free ユーザーが住所を入力しても zoning は取得されない（未実装）。

### 変更内容

| | 変更前 | 変更後 |
|-|-------|-------|
| EN (line 35) | `"Optional — adds lot size & zoning data (coming soon)"` | `"Optional — adds neighborhood data (lot size & zoning: connect MLS on Pro)"` |
| ES (line 141) | `"Opcional — agrega tamaño del lote y zonificación (próximamente)"` | `"Opcional — agrega datos del vecindario (tamaño del lote y zonificación: conecta MLS en Pro)"` |

**効果:** 偽の "coming soon" 約束を削除。MLS on Pro への誘導に変換。

---

## 修正2：デモの "7%" 金利ハードコード更新

### 背景
LP のデモウィジェットに "7%" のハードコード金利が 2 箇所あった。プロダクトの金利ロジックは FRED API から live レートを取得（`src/lib/mortgage-rate.ts`）しており、フォールバックは 6.5%。現行水準（2026-06 時点）は約 6.7–6.9%。

### 変更内容

| 箇所 | 変更前 | 変更後 |
|-----|-------|-------|
| Hero demo widget (line 343) | `"Mortgage (20% down, 30yr, 7%)"` | `"Mortgage (20% down, 30yr, ~6.8%)"` |
| How section demo (line 814) | `"(20% down · 30yr · 7%)"` | `"(20% down · 30yr · ~6.8%)"` |

**注意:** デモの月額 "$1,876/mo" は静的モック値であり変更していない（マーケ用モックの範囲）。プロダクトの金利ロジック（`mortgage-rate.ts`）は一切変更していない。

---

## 修正3：MLS ライセンス連携を Pro の主要差別化として前面化

### 背景
G-MLS-01/02 でMLS監査ログ・zoning生成反映が本番稼働。しかし LP では Pro の箇条書きに1行あるだけで、NAR/IDX 準拠・監査ログ・"requires your MLS license" の明記が弱かった。Step 3 MLS カードも説明が薄かった。

### 変更内容

**Pro features 行 EN (line 90)**
- 変更前: `"MLS lot data via Trestle (requires your MLS license)"`
- 変更後: `"MLS listing data — real lot size & zoning in every plan (requires your MLS license)"`

**Pro features 行 ES (line 196)**
- 変更前: `"MLS via Trestle (requiere tu licencia MLS)"`
- 変更後: `"Datos MLS — tamaño del lote y zonificación reales en cada plano (requiere tu licencia MLS)"`

**Step 3 MLS カード (line 1112)**
- 変更前: `"Connect your MLS license via Trestle to auto-fill real lot size, zoning, and listing details into every proposal."`
- 変更後: `"Connect your own MLS license via Trestle to auto-fill real lot size & zoning into every concept plan. NAR/IDX-compliant — every data call is audit-logged. Requires your own MLS license."`

**効果:**
- "real lot size & zoning in every plan" でプロダクトの実能力を明確化
- NAR/IDX 準拠・監査ログを明記（FAQ の MLS 監査記述と整合）
- "Requires your own MLS license" を Step 3 カードにも明記

---

## 検証

| 検証項目 | 結果 |
|---------|------|
| `npm run build` | ✅ 型エラーなし・全39ページコンパイル成功 |
| "7%" 残存チェック | ✅ 0件 |
| "coming soon" 残存チェック | ✅ 対象箇所は削除済み（MLS coverage map の "coming soon" は別件・変更なし） |
| MLS未接続ユーザー regression | ✅ なし（JSX のロジックは変更していない、コピーのみ） |

---

## 変更ファイルまとめ

| ファイル | 変更箇所 | 内容 |
|---------|---------|------|
| `src/app/HomePageClient.tsx` | line 35 | EN streetHint 修正 |
| `src/app/HomePageClient.tsx` | line 141 | ES streetHint 修正 |
| `src/app/HomePageClient.tsx` | line 343 | Hero demo "7%" → "~6.8%" |
| `src/app/HomePageClient.tsx` | line 814 | How demo "7%" → "~6.8%" |
| `src/app/HomePageClient.tsx` | line 90 | EN Pro features MLS 強化 |
| `src/app/HomePageClient.tsx` | line 196 | ES Pro features MLS 強化 |
| `src/app/HomePageClient.tsx` | line 1112 | Step 3 MLS カード copy 強化 |
| `docs/launch/lp-copy-fixes-20260604.md` | 本ファイル（新規） | 修正記録 |

合計: 1ファイル（HomePageClient.tsx）に7行変更 + docs新規作成
