# SplanAI 対応地域 実態調査レポート

**作成日**: 2026-05-26  
**調査対象**: フロアプラン生成・近隣データ・コスト推定が依存する外部データソース  
**方針**: 推測を事実として書かない。コード引用で根拠を明示。

---

## 1. 結論サマリー

| 機能 | 対応範囲 | 根拠 |
|------|---------|------|
| AIフロアプラン生成 | **全米（無制限）** | 地域バリデーションなし |
| 近隣データ（Google Maps） | **全50州** | 地域制限なし、月間使用量上限あり |
| 市場データ（RentCast） | **全米（月50件上限）** | 地域制限なし、ただし上限が非常にタイト |
| MLS物件データ（Trestle） | **ユーザーのMLSボード依存** | Pro/Team限定・地域はユーザーのライセンス次第 |

**一行結論**: フロアプラン生成と近隣データは全50州で制限なく動作する。RentCast市場データは全米対応だが月50件の上限が実質的なボトルネック。MLS連携はユーザーが所属するMLSボードの地域に依存。

---

## 2. データソース別 詳細

### 2-1. AIフロアプラン生成（Anthropic Claude API）

**対応地域**: 全米（事実上グローバル）

- 地域バリデーション: **なし**
- `src/app/api/generate/route.ts:101` — `validateGenerateInput()` が検証するのは `lotSize`・`budget`・`familySize` のみ
- ロケーション情報はAPIに送信されない
- システムプロンプト（`route.ts:15-55`）は「United States の住宅建築家」として設定されており、全米を想定した汎用的な建築ルールを使用
- 地域特有の建築コード・ゾーニング・コスト単価の考慮: **なし**（コスト推定は汎用値のみ）

**フォールバック**: なし（Claude APIが応答しない場合はエラー）

---

### 2-2. 近隣データ（Google Maps Platform）

**対応地域**: 全50州（技術的制限なし）

- 地域バリデーション: **形式チェックのみ**
  - `src/app/api/neighborhood/route.ts:123` — 英字・スペース・ハイフン・アポストロフィのみ許可（特定州の制限なし）
  ```typescript
  if (!/^[a-zA-Z\s\-'.]{1,60}$/.test(city) || !/^[a-zA-Z\s]{1,30}$/.test(state))
  ```
- Geocoding API: `route.ts:50` — `${city}, ${state}, USA` 形式でリクエスト（全米対応）
- Nearby Search: `route.ts:145-155` — 学校・病院・食料品店・警察・消防の5カテゴリ（全米で均一に機能）

**使用量上限** (`src/lib/external-apis.ts:12-13`):
```typescript
google_maps: { warn: 25_000, stop: 28_000 }  // 月間リクエスト数
```
上限到達時: `{ available: false, reason: 'Data unavailable at this time' }` を返し、フロアプラン生成自体は継続。

**データの厚みの差**: Google Maps の精度は都市部（Austin, Phoenix, Denver 等）が高く、農村部・未整備エリアでは Near Places 検索の結果数が少ない可能性がある。これは Google Maps 側の問題であり、SplanAI のコードに地域別制限はない。

---

### 2-3. 市場データ（RentCast API）

**対応地域**: 全米（API仕様上）

- 地域バリデーション: **なし**
- `src/app/api/neighborhood/route.ts:195` — `city, state, zipCode` をパラメータとして送信
- zipCode がある場合のみ実行（Geocodingが失敗した場合はスキップ）

**使用量上限** (`src/lib/external-apis.ts:13`):
```typescript
rentcast: { warn: 45, stop: 50 }  // 月間リクエスト数（全ユーザー合計）
```
⚠️ **重要制約**: 月50件はアプリ全体の合計上限。1日50リクエストで月上限に達する。現フェーズ（Phase 0: MRR < $500）では実用上の問題は少ないが、ユーザー増加時に枯渇するリスクがある。

**フォールバック**: `route.ts:217-219` — 上限到達時は `RENTCAST_LIMIT` を返し、市場データセクションを非表示にする（近隣データ自体は表示継続）。

**データの厚みの差**: RentCast のカバレッジはAPI仕様（全米主要市場）に依存。地方・農村部はデータが薄い可能性があるが、SplanAI のコードに地域別制限はない。

---

### 2-4. MLS物件データ（Trestle API）

**対応地域**: ユーザーが所属するMLSボードの管轄地域

- アプリ側の地域制限: **なし**
- `src/app/api/mls/lot-data/route.ts:20` — `StateOrProvince` をフィールドとして取得（制限ではなく読み取り）
- ユーザーが自身のTrestle MLS認証情報を入力する方式（`src/app/dashboard/DashboardClient.tsx:488`）
- ダッシュボード上の表示: "Real lot data from 500+ MLS boards nationwide"

**制限**: Pro/Team プランのみ（`src/app/api/mls/connect/route.ts:42-48`）  
**フォールバック**: 物件未発見時 404 エラー

**実質的な対応地域**: ユーザーのMLSライセンスが有効な地域のみ。SplanAI は全米MLSへの接続口（Trestle経由）を提供しているが、実データへのアクセスはユーザーのライセンス次第。

---

## 3. 地域バリデーション・許可リストの有無

| チェック項目 | 結果 |
|------------|------|
| 特定州のブロック | **なし** |
| 許可リスト（allowed states） | **なし** |
| 州コードの正規化・バリデーション | **なし**（形式チェックのみ） |
| 米国外リクエストのブロック | **なし**（技術的には可能だが実用価値なし） |

---

## 4. データ非取得時のフォールバック挙動

| シナリオ | 挙動 |
|---------|------|
| Geocodingが失敗（存在しない市名等） | 近隣データAPIが `null` を返す。結果ページは近隣セクションを非表示 |
| Google Maps 月間上限到達 | `available: false` を返す。フロアプラン生成は継続 |
| RentCast 月間上限到達 | 市場データセクションを非表示。他のデータは表示 |
| RentCast zip未取得時 | RentCast リクエスト自体をスキップ |
| MLS接続なし / 物件未発見 | MLS機能全体が非表示（Free/Pro未接続ユーザーには元々非表示） |

---

## 5. 実質的な対応範囲の評価

### 確実に動作する（コード根拠あり）
- AIフロアプラン生成: **全50州**
- 近隣データ（学校・病院等）: **全50州**

### 動作するが制約あり
- 市場データ（家賃・販売価格）: 全米対応だが **月50件上限**（ローンチ初期は問題なし）
- MLS物件データ: **ユーザーのMLSライセンス管轄内のみ**

### データの厚みに差がある
- 農村部・過疎エリア: Nearby Search の結果数が少ない可能性（Google Maps側の問題）
- 地方小都市: RentCast の市場データが薄い可能性（RentCast側のカバレッジ依存）

---

## 6. 営業資料に使える表現案（誇張なし）

### ✅ 使用可能な表現
> "Works in all 50 states — generate AI floor plans and get neighborhood insights anywhere in the US."

> "Covers all 50 states for floor plan generation. Neighborhood data powered by Google Maps, available nationwide."

> "MLS lot data available through 500+ MLS boards nationwide (Pro/Team plan, requires your MLS login)."

> "Market data (rental rates, home values) available in major US markets. Some rural areas may have limited data."

### ❌ 使用すべきでない表現
> ~~"Full coverage nationwide including rural areas"~~ — 農村部はデータが薄い可能性
> ~~"Real-time market data for every zip code"~~ — RentCast月50件上限・農村部カバレッジ不確実
> ~~"Complete MLS data nationwide"~~ — ユーザーのライセンス依存であることを隠す

---

## 7. 推奨アクション（post-launch）

1. **RentCast 上限引き上げ**: ユーザーが50人を超えたら月50件上限が枯渇リスク。Phase 1でプラン変更を検討。
2. **FAQ文言の維持**: `page.tsx:97` の現在のFAQ文言は正確。変更不要。
3. **農村部カバレッジの注記**: 営業資料に「Major metro areas covered; rural data may be limited」を追加することで誤解を防ぐ。

---

*調査実施: 2026-05-26 / コード参照: src/app/api/generate/route.ts, src/app/api/neighborhood/route.ts, src/app/api/mls/lot-data/route.ts, src/lib/external-apis.ts, src/app/page.tsx, src/app/dashboard/DashboardClient.tsx*
