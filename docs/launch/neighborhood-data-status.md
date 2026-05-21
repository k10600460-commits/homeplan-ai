# Neighborhood & Market Data — Status Report

**調査日**: 2026-05-21 | **ブランチ**: `fix/neighborhood-data-20260521`

---

## 各データソース 現状サマリー

| Data Source | 状態 | 修正内容 |
|-------------|------|---------|
| Google Maps Geocoding | ✅ Working | zipCode 取得に逆ジオコード fallback 追加 |
| Google Places (Schools / Hospitals / Groceries) | ✅ Working | 変更なし |
| Google Places (Police / Fire stations) | ⚠️ 不安定 | Safety Score 算出ロジックを修正 |
| RentCast Market Data | 🔧 修正済み | zipCode null 問題を解消 → 次回テストで確認 |

---

## 根本原因と修正内容

### 問題 1: Safety Score が常に "Low" / 3

**症状**: Austin TX で "Safety Score: Low / 3 / 0 police · 0 fire stations within 5 km"

**根本原因**:
- Google Places API の `police` / `fire_station` タイプは信頼性が低く、Austin のような大都市でも 0 件を返すことが多い
- 従来の算出式: `score = 3 + police*2 + fire*1` → 0+0 = **3 = Low**
- Austin が "Low" と表示されるのは実態と乖離

**修正** (`computeSafetyScore`):
```typescript
// 旧: baseline 3 (Low)
const raw = 3 + policeCount * 2 + fireCount * 1

// 新: baseline 5 (Moderate) + 各施設は加点ボーナス
const raw = 5 + Math.min(policeCount, 3) + Math.min(fireCount, 2)
```

| 状況 | 旧スコア | 新スコア |
|------|---------|---------|
| Google が 0件返した（大都市含む） | 3 = Low | 5 = Moderate |
| 1 police + 1 fire found | 6 = Moderate | 8 = High |
| 3+ police + 2+ fire found | 10 = High | 10 = High |

---

### 問題 2: RentCast Market Data が常に空

**症状**: "Market data temporarily unavailable. Check back soon."

**根本原因**:
- `api_usage_external` に `rentcast` のレコードがゼロ = RentCast API が一度も呼ばれていない
- コードの呼び出し条件: `if (rentCheck.allowed && RENTCAST_API_KEY && zipCode)`
- `RENTCAST_API_KEY` は Vercel に設定済み（step21 確認済み）
- **`zipCode` が常に null** = city-level の forward geocode には `postal_code` コンポーネントが含まれない
  - `geocode("Austin", "TX")` → `{lat, lng}` は返るが、`address_components` に `postal_code` なし

**修正** (`geocode()` 関数に逆ジオコード fallback 追加):
```typescript
// forward geocode で postal_code が取れなかった場合
if (!zipCode) {
  // lat/lng を使って逆ジオコード（result_type=postal_code）
  const revUrl = `...?latlng=${lat},${lng}&result_type=postal_code&key=${key}`
  // → この結果には必ず postal_code が含まれる
  zipCode = revData.results[0].address_components
    .find(c => c.types.includes('postal_code'))?.long_name ?? null
}
```

- 逆ジオコードは city-level クエリ時のみ実行（zipCode が null の時だけ）
- 実行した場合は `recordExternalUsage('google_maps')` で追加カウント

---

## Schools データ（Task 4）

**現状**: ✅ 既に実装・表示済み
- API: `getNearbyPlaces(..., 'school')` で取得
- 表示: `results/page.tsx` の Nearby Schools セクション（schools.length > 0 の場合のみ表示）
- LP の "Schools 8.4/10" は mock 値。実装は Google Places の school リスト表示（rating付き）
- Google Places の `school` タイプは比較的信頼性が高く、Austin TX では複数件返ってくるはず

---

## API Quota 状況（2026-05 時点）

| Service | 月次使用数 | 警告閾値 | 停止閾値 | 状態 |
|---------|-----------|--------|--------|------|
| google_maps | 30 | 25,000 | 28,000 | ✅ 余裕あり |
| rentcast | 0 | 45 | 50 | 未使用（修正後に増加する） |

**逆ジオコード追加後の quota 影響**:
- city-level クエリ 1回あたり +1 Google Maps request
- 月28,000 の制限に対して、数十件程度の増加 = 無視できるレベル

---

## 動作確認チェックリスト（人間テスト）

デプロイ後、以下のケースで /results を確認:

- [ ] Austin, TX (8500 sqft, $350K, 4 people) → Safety: Moderate 以上 / Market: 数値表示
- [ ] Houston, TX → 同様
- [ ] Miami, FL → 同様
- [ ] Supabase で `SELECT * FROM api_usage_external` → `rentcast` のレコードが増えていること

---

## 残課題

| 課題 | 優先度 | 理由 |
|------|-------|------|
| Safety Score の外部データソース検討（FBI Crime Data等） | Medium | Google Places は本質的に不安定 |
| Schools の rating 表示改善（GreatSchools API等） | Low | 現在は Google Places の rating を使用 |
| LP の "Schools 8.4/10" mock 値を実データに差し替え | Low | 現状は LP のみ mock 表示 |

---

_作成: 2026-05-21 | fix/neighborhood-data-20260521_
