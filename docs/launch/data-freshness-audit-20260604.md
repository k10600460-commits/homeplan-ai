# データ鮮度監査 — SplanAI メイン機能
**日付:** 2026-06-04  
**調査方法:** 実コード引用のみ。推測なし。変更なし。

---

## 1. データ分類表

| データ項目 | 分類 | 実体・出所 | 備考 |
|-----------|------|-----------|------|
| プラン（name/style/sqft/beds/baths/stories/rooms/highlights/features） | **生成 (LLM)** | `claude-sonnet-4-6`、毎回フレッシュ生成 | `generate/route.ts:100` |
| estimatedCost | **生成 (LLM)** | Claude がシステムプロンプトの `$150–$250/sqft` を使って算出 | 外部コスト指標は不使用 |
| description / features / highlights テキスト | **生成 (LLM)** | モデル知識のみ。外部データ不混入 | トレーニング知識による文体 |
| 近隣データ（学校/病院/スーパー/安全スコア） | **live** | Google Maps Geocoding + Places API、リクエスト毎 | `neighborhood/route.ts:144-188` |
| 市場データ（平均家賃・売却価格） | **live** | RentCast API、リクエスト毎 | `neighborhood/route.ts:197-223` |
| 住宅ローン 金利デフォルト | **固定定数** | `useState(7.0)` (`results/page.tsx:109`、`SharePortalClient.tsx:30`) | 外部API不使用 |
| 住宅ローン 期間デフォルト | **固定定数** | `useState(30)` (`results/page.tsx:110`、Portal: 30yr固定 `SharePortalClient.tsx:31`) | Portal はローン期間選択UI なし |
| 住宅ローン 頭金デフォルト | **固定定数** | `useState(20)` (`results/page.tsx:109`、`SharePortalClient.tsx:29`) | — |
| 共有ポータル プランデータ | **スナップショット** | `shared_links.plans` (INSERT時の JSON) | `share/create/route.ts:58-59` |
| 共有ポータル 近隣/市場データ | **なし** | 保存されていない / ポータルに表示なし | `handleShare` が `{ plans }` のみ送信 (`results/page.tsx:629`) |
| PDF の月払い計算 | **固定定数** | `calcMonthly(estimatedCost, 20, 7.0, 30)` ハードコード (`SharePortalClient.tsx:523`) | UI スライダー値は PDF に反映されない |
| コンセプト外観画像 | **固定** | `public/concept-styles/*.jpg`（静的ファイル）| `feature/portal-concept-images` 未マージ |
| Neighborhood APIレスポンス HTTPキャッシュ | **1時間ブラウザキャッシュ** | `Cache-Control: private, max-age=3600` (`neighborhood/route.ts:227`) | サーバー側キャッシュ層なし |

---

## 2. 「常に最新」と言える項目 / 言えない項目

### ✅ 常に最新（生成時点）
- **近隣データ**（学校・病院・スーパー・安全スコア）: Google Maps API にリクエスト毎にライブ取得。同一ユーザーが1時間以内に同じ city/state を再リクエストした場合のみブラウザキャッシュが返るが、実質ライブ。
- **市場データ**（家賃・売却価格）: RentCast API にライブ取得。ただし RentCast 自体のデータは月次更新であり、API が返す値は RentCast の最新スナップショット。
- **プラン生成内容**: Claude は毎回フレッシュに生成（LLM応答キャッシュなし）。

### ❌ 常に最新とは言えない項目

#### 住宅ローン金利（最大リスク）
- デフォルト `7.0%` は **2024年頃の市場水準を反映したハードコード定数**。  
  定義箇所:
  - `results/page.tsx:109` — `useState(7.0)`
  - `SharePortalClient.tsx:30` — `useState(7.0)`
  - `SharePortalClient.tsx:523` — PDF: `calcMonthly(plan.estimatedCost, 20, 7.0, 30)` 固定
- ユーザーはスライダーで 3〜12% の任意値に変更できる（UI上のリアルタイム計算）。
- **PDF に印刷される月払いは常に `7.0%/20%/30yr` で固定**（スライダー調整値は PDF に反映されない）。
- Freddie Mac / CFPB などの外部 API は一切呼んでいない。

#### 共有ポータル（古いリンク）
- ポータルは **生成時の `shared_links.plans` JSON のみを表示**。近隣・市場データは保存されていない。
  - `share/create/route.ts:58-59`: `insert({ ..., plans })` — `plans` のみ。
  - `results/page.tsx:629`: `body: JSON.stringify({ plans })` — 近隣・市場を送っていない。
- **古いポータルを後日開いた時は生成時点のプランデータ（=スナップショット）が表示される**。金利は UI デフォルト 7.0%。
- LP の「近隣データ付き」は結果ページにのみ適用され、バイヤー向けポータルには近隣/市場データは存在しない。

#### estimatedCost
- Claude のシステムプロンプトに `"typical construction: $150-$250 per sq ft"` とハードコードされており (`generate/route.ts:22`)、実際の地域別・時点別コスト指標は参照していない。
- モデルのトレーニング知識由来の定数コスト帯。地域・時期による乖離あり。

---

## 3. 外部API 上限到達時の挙動

### Google Maps (stop = 28,000 requests/month)
`checkExternalUsage('google_maps')` が `{ allowed: false }` を返した場合:
```ts
// neighborhood/route.ts:192-194
} else if (!mapsCheck.allowed) {
  result.neighborhood = GMAPS_UNAVAILABLE  // { available: false, reason: 'Data unavailable at this time' }
}
```
UI: `results/page.tsx:1129-1134` — グレーカードに理由テキスト表示。  
**直近値の保持なし。空白表示のみ。**

### RentCast (stop = 50 requests/month)
`checkExternalUsage('rentcast')` が `{ allowed: false }` を返した場合:
```ts
// neighborhood/route.ts:197-200
const rentCheck = await checkExternalUsage('rentcast')
const zipCode = geocodeResult?.zipCode
if (rentCheck.allowed && ...) { ... }
else if (!rentCheck.allowed) {
  result.market = RENTCAST_LIMIT  // { available: false, reason: 'Market data limit reached' }
}
```
UI: `results/page.tsx:1140-1155` — ダッシュ（`—`）のプレースホルダー4枠を表示。  
**直近値の保持なし。キャッシュフォールバックなし。**

---

## 4. LLM 知識カットオフの影響

プラン説明文・features・highlights はすべて LLM 生成テキスト。外部データとの混在はないが以下の LLM 知識由来の定数がある:
- `generate/route.ts:22`: システムプロンプトに `"$150-$250 per sq ft"` → `estimatedCost` に直接影響
- スタイル名（Craftsman, Modern Farmhouse 等）はモデル知識

Near-fact 混入リスクは限定的。モデルは「床面積×コスト単価」の計算を指示されており、誤った固有名詞や存在しない地名を挿入する構造にはなっていない（入力は lot size, budget, family size のみ）。

---

## 5. 鮮度リスクと最小修正案（変更なし、記録のみ）

| リスク | 重大度 | 最小修正案 |
|--------|--------|-----------|
| **金利 7.0% 固定** — 市場から乖離した場合、月払い試算が大きく外れる | 高（買い手への信頼損失） | (a) 定数を CLAUDE.md 管理して月次手動更新、または (b) 30yr固定 Freddie Mac Primary Mortgage Market Survey API（無料）をライブ取得 |
| **PDF の月払いがスライダー値と異なる** — ユーザーが 6% に調整してもPDF は 7% で印刷 | 中（混乱）| `buildPDF` に `ratePct`/`downPct` を引数として渡す（現在ハードコード） |
| **ポータルに近隣・市場データがない** — LP「近隣データ」の訴求がポータルで確認できない | 中（訴求と実態のズレ） | `share/create` に近隣・市場 JSON を含め `shared_links` に保存 → ポータルに「生成時データ」として表示 |
| **ポータルに生成日表示がない** — バイヤーがいつ作成されたか不明 | 低（信頼性） | `shared_links.created_at` をポータルフッターに表示 (`created_at` は既存カラム) |
| **RentCast 上限到達時のキャッシュなし** — 月末にデータが完全消滅 | 低（月50件はすぐ消費しない） | 直近の成功レスポンスを `api_usage_external` か別テーブルにキャッシュして stopped 時にフォールバック |
| **estimatedCost が地域別コストを反映しない** | 低（業界想定範囲内）| 免責テキスト「Estimate only · Verify with local contractor」は既に全面表示済み |

---

## 参照ファイル

| ファイル | 参照箇所 |
|---------|---------|
| `src/app/api/generate/route.ts` | Claude モデル名・システムプロンプトのコスト定数 |
| `src/app/api/neighborhood/route.ts` | Google Maps・RentCast ライブ取得・上限ガード・Cache-Control |
| `src/lib/external-apis.ts` | `checkExternalUsage` / `LIMITS` 定義 |
| `src/app/api/share/create/route.ts` | `shared_links` INSERT (plans のみ) |
| `src/app/s/[slug]/page.tsx` | portal が `shared_links.plans` のみ読む |
| `src/app/s/[slug]/SharePortalClient.tsx` | 金利デフォルト・PDF ハードコード・近隣データなし |
| `src/app/results/page.tsx` | 金利デフォルト・`handleShare` が plans のみ送信 |

---

## 6. PR#13 マージ後の解決状況（2026-06-04）

上記の「鮮度リスク」のうち、PR#13（commit `6b7d38c`）で以下が解決済み:

| リスク | 旧状態 | 解決後 |
|--------|--------|--------|
| **金利 7.0% 固定** | `useState(7.0)` ハードコード | FRED `MORTGAGE30US`（週次）ライブ取得 → `6.53%`（2026-05-29時点）。`src/lib/mortgage-rate.ts` + `/api/mortgage-rate` 新設。 |
| **PDF の月払いがスライダー値と異なる** | `calcMonthly(cost, 20, 7.0, 30)` 固定 | `rate/downPct/termYears` を `buildPDF` に引数渡し（`results/page.tsx` 修正済み）。 |
| **ポータルに近隣・市場データがない** | `shared_links` に `city/state` なし、portal に表示なし | DB カラム追加（`city/state/financials/neighborhood_snapshot/market_snapshot/area_refreshed_at`）、24h TTL キャッシュ付きで取得・表示。Tampa 検証済み ✅ |

### 引き続きオープンのリスク

| リスク | 状態 | 参照 |
|--------|------|------|
| **ポータルに生成日表示がない** | 未対応（`shared_links.created_at` は存在する） | — |
| **RentCast 上限到達時のキャッシュなし** | 未対応（50件/月上限・月末リスク） | — |
| **estimatedCost が地域別コストを反映しない** | 未対応（免責テキスト表示で許容） | — |
| **コンセプト画像がプレースホルダー** | 実写差し替え待ち（OI-018） | `public/concept-styles/*.jpg` |

参照: `docs/launch/post-merge-open-issues-20260604.md`
