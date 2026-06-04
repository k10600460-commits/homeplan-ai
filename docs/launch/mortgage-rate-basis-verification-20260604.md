# 住宅ローン金利「常に現在値基準」検証
**日付:** 2026-06-04  
**対象ブランチ:** `fix/lp-mls-copy-zoning-rate-20260604`  
**調査スコープ:** read-only（コード変更なし）

---

## 検証1: /api/mortgage-rate の挙動

**判定: ✅ OK**

`src/lib/mortgage-rate.ts:11-35` — `_fetchFredRate()`：

```
FRED MORTGAGE30US（降順・limit=1）→ 最新観測値 → { rate, asOf, source: 'fred' }
FRED_API_KEY 未設定 → { rate: 6.5, source: 'fallback' }（line 13-15）
FRED fetch 失敗 → catch → { rate: 6.5, source: 'fallback' }（line 32-34）
```

- 7% や任意の固定値に戻る経路は存在しない。
- フォールバックは **常に 6.5%** のみ。
- `rate/asOf/source` 3フィールドを返す（`route.ts:8` でそのまま JSON 返却）。

---

## 検証2: キャッシュ/鮮度

**判定: ✅ OK（FRED の週次更新頻度に対し適切）**

```
mortgage-rate.ts:38-42
  unstable_cache(fn, key, { revalidate: 86400 })   ← Next.js Data Cache 24h

route.ts:4
  export const revalidate = 86400                   ← Route Segment Cache 24h

route.ts:9
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

- FRED は `MORTGAGE30US` を毎週木曜に更新。24h TTL なら翌日には最新値を反映する（最大 24h の遅延）。
- フォールバック（6.5%）は TTL 満了後も再取得失敗時に適用されるため、古い任意の値が残り続けるリスクはない。
- 注意: `unstable_cache` + route revalidate の二重設定は冗長だが動作に支障はない。

---

## 検証3: 利用箇所の一貫性（全サーフェス列挙）

### 3-A. 結果ページ (`src/app/results/page.tsx`)

**初期 state**  
`line 604: useState<MortgageSnapshot>({ downPct: 20, ratePct: 6.5, termYears: 30 })`  
→ ハードコード 6.5 だが、同ファイル `lines 657-663` の `useEffect` で即座に `/api/mortgage-rate` を fetch し、live レートへ更新する：

```typescript
fetch('/api/mortgage-rate')
  .then(r => r.json())
  .then((d: { rate: number; asOf: string }) => {
    setMortgageInputs(prev => ({ ...prev, ratePct: d.rate }));
    setRateAsOf(d.asOf);
  })
  .catch(() => {}); // 失敗時は 6.5 のまま（= フォールバックと同値）
```

**判定: ✅ OK**（初期 6.5 はフォールバックと一致。API 解決後は live レートへ更新）

**コメント内の例示値**  
`line 77: // annual %, e.g. 7.0` → コードコメントのみ、挙動に影響なし。

---

### 3-B. 結果ページ PDF (`buildPDF` at `line 239`)

```typescript
buildPDF(plans, formData, branding, mortgageInputs)
// ↑ handleExportAll/handleExportOne から呼び出し（lines 726, 742）
```

PDF 内の計算 `line 370: const mRate = mortgage?.ratePct ?? 6.5`  
→ ユーザーがダウンロードする時点での `mortgageInputs`（= live レート更新済み）を使う。

**判定: ✅ OK**（PDF には live レートが反映される）

---

### 3-C. 共有リンク作成 (`share/create/route.ts` + `results/page.tsx:670-697`)

```typescript
// results/page.tsx:681-686
financials: {
  rate: mortgageInputs.ratePct,  // ← share 時点の live レート
  downPct: mortgageInputs.downPct,
  termYears: mortgageInputs.termYears,
  rateAsOf,                       // ← FRED の観測日
},
```

→ `shared_links.financials` として DB に保存（`share/create/route.ts:34,67`）。

**潜在エッジケース**: ユーザーがページ読み込み直後（`/api/mortgage-rate` 解決前、約 100-200ms 以内）に Share ボタンを押すと、`ratePct: 6.5`（初期値）がスナップショットされる。実用上は問題なし（6.5 = フォールバック値）。

**判定: ✅ OK**（share ボタン操作前に API は解決済みが通常。エッジは 6.5 でフォールバック一致）

---

### 3-D. 共有ポータル (`src/app/s/[slug]/SharePortalClient.tsx`)

**MortgageWidget 初期値**（line 39）：
```typescript
const [ratePct, setRatePct] = useState(initialFinancials?.rate ?? 6.5);
```

**PDF 生成**（line 539）：
```typescript
const mRate = financials?.rate ?? 6.5;
```

`financials` は `shared_links.financials`（DB 保存値 = share 時点のスナップショット）。  
ポータル表示時に FRED を再 fetch **しない**（スナップショット設計）。  
`rateAsOf` を UI に表示（`line 50, 1223`）して透明性を担保。

**判定: ✅ OK by design**（スナップショットは意図的。`rateAsOf` ラベルで観測日を表示）

---

### 3-E. 中国語 PDF（サーバーサイド、`src/app/api/generate-pdf/route.ts`）

`grep -n "mortgage|rate|6.5" generate-pdf/route.ts` → 0件。  
中国語 PDF はローン計算を含まない（間取り・仕様のみ）。

**判定: N/A**（金利計算なし）

---

### 3-F. LP デモウィジェット (`HomePageClient.tsx`)

変更前 "7%"（2箇所）→ 本ブランチで "~6.5%" に修正済み（A 対応）。  
デモは静的モックのため live レートとは連動しない（マーケ用途）。

**判定: A 対応により修正済み**

---

## 検証4: スライダー連動

**判定: ✅ OK**

`results/page.tsx:992-994`：
```typescript
onDownPct={v => setMortgageInputs(p => ({ ...p, downPct: v }))}
onRatePct={v => setMortgageInputs(p => ({ ...p, ratePct: v }))}
onTermYears={v => setMortgageInputs(p => ({ ...p, termYears: v }))}
```

スライダー変更 → `mortgageInputs` state 更新 → `MortgageCalculator` が `calcMortgage()` を再計算 → 月額表示が即時反映。PDF は `mortgageInputs` をそのまま使うため、ユーザー調整後の値が反映される。

---

## 検証5: 共有ポータルの 24h スナップショット

**判定: ✅ OK by design**

- 保存レートは「その時点の live レート」（share 実行時の `mortgageInputs.ratePct`）。
- ポータルと PDF で同一の `financials` オブジェクトを使用（`SharePortalClient` line 864, 886 の `buildPDF(plans, lang, branding, financials)`）。
- ポータル再訪時の再計算は行われない（スナップショット固定）。
- `rateAsOf` フィールドで観測日を表示し、"as of ..." ラベルで透明性を担保。

---

## ハードコード残存値の全件確認

```
grep -rn "7\.0\|7\.5" src/ --include="*.ts" --include="*.tsx" （除: コメント・demo）
```

| ファイル | 行 | 内容 | 判定 |
|---------|---|------|------|
| `results/page.tsx:77` | コメント `// e.g. 7.0` | インターフェース説明コメント | 無害 |
| `HomePageClient.tsx:343,814` | デモ表示 | 本ブランチで ~6.5% に修正 | 修正済み |

その他のプロダクトロジック内に 7.0% や任意の固定金利は**存在しない**。

---

## 問題一覧（軽微 / 修正推奨なし）

| # | 箇所 | 内容 | 影響 |
|--|------|------|------|
| M-01 | `results/page.tsx:77` | コメント `e.g. 7.0` | 無し（コメントのみ） |
| M-02 | `results/page.tsx:604` | 初期 state `ratePct: 6.5` ハードコード | 軽微。API 解決前の ~100ms のみ。6.5 = フォールバック一致。修正優先度: 低 |
| M-03 | ポータル rate | スナップショット固定（再フェッチなし） | 設計通り。`rateAsOf` で透明性あり。修正不要 |

---

## 総括

**金利は常に現在値基準か？ → 部分的 (Yes for UI / Snapshot for portal)**

- **結果ページ（スライダー・PDF）**: ✅ live FRED レートを seed し、ユーザー調整も反映
- **共有ポータル（ウィジェット・PDF）**: ✅ share 時点の live レートのスナップショット（設計通り）
- **LP デモ**: A 対応で "~6.5%" に修正済み（静的モック・live 連動なし）
- **中国語 PDF**: ローン計算なし（N/A）

重大なバグや 7% ハードコード混入はなし。"部分的" の主因はポータルのスナップショット設計（意図的）と、初期 state の 6.5 ハードコード（低優先・実害なし）。
