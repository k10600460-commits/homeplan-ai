# PR#13 マージ後 オープンイシュー
**日付:** 2026-06-04  
**対象 PR:** #13 — Feature/data freshness and portal data (`6b7d38c`)

---

## 解決済み（PR#13 で対応完了）

| ID | 課題 | commit |
|----|------|--------|
| OI-R24 | 住宅ローン金利 7.0% ハードコード → FRED MORTGAGE30US ライブ取得 | `4add9fb` |
| OI-R23 | 共有ポータルに近隣・市場データが未表示 → Phase2 実装・DB マイグレーション | `c334fb0` |
| OI-R22 | 近隣データが全ゼロ件（`REQUEST_DENIED` を空配列に変換していたバグ） | `8585f77` |
| OI-R21 | ブログ記事タイトル H1 が2重表示 → render-time strip | `3aecc5c` |

---

## オープン（引き継ぎ）

### OI-018 コンセプト画像をプレースホルダー→実写に差し替え【🟡 必須 / 低難度】

**概要**: `public/concept-styles/` 内の6枚がプレースホルダー（無地の小さいJPEG）のまま本番稼働中。

**対応**: 6ファイルを権利取得済み実写 JPEG で上書きするだけ。コード変更不要。

**ファイル**:
```
public/concept-styles/craftsman.jpg
public/concept-styles/farmhouse.jpg
public/concept-styles/contemporary.jpg
public/concept-styles/traditional.jpg
public/concept-styles/transitional.jpg
public/concept-styles/default.jpg
```

**注意**: ファイル名・パスは変更しないこと（`src/lib/concept-style-image.ts` の静的マッピングがファイル名に依存している）。

**参照**: `src/lib/concept-style-image.ts`, `src/app/s/[slug]/SharePortalClient.tsx`

---

### OI-019 GCP 旧 "Places API" の有効化 or legacy フォールバック削除【🟢 任意】

**概要**: `GOOGLE_MAPS_API_KEY` には "Places API (New)" のみ有効。`src/lib/neighborhood.ts` の legacy `nearbysearch/json` フォールバック（約10行）は現状 DEAD コード（呼ばれると `REQUEST_DENIED` になる）。

**対応（2択）**:
- (a) Google Cloud Console → API とサービス → ライブラリ で "Places API"（legacy）を有効化 → 真のフォールバックとして機能する。コード変更不要。
- (b) `src/lib/neighborhood.ts` の legacy フォールバックブロック（`// Fall back to legacy Places API` 以降）を削除 → コードが簡潔になる。

**推奨**: どちらでも動作に影響なし。(b) のほうが将来の混乱を防げる。

**参照**: `docs/launch/portal-neighborhood-zero-investigation-20260604.md`, `src/lib/neighborhood.ts:125-137`

---

## 継続オープン（PR#13 スコープ外）

以下は PR#13 で意図的に対応しなかった項目（`data-freshness-audit-20260604.md §5` 参照）:

| 課題 | 状態 | 優先度 |
|------|------|--------|
| ポータルに生成日表示がない | `shared_links.created_at` は存在する。フッター表示のみ | 低 |
| RentCast 上限到達時のキャッシュなし | 50件/月の月末リスク | 低 |
| `estimatedCost` が地域別コストを反映しない | 免責テキスト表示で許容 | 低 |
| `plan_generations` INSERT 未配線（OI-007） | Daily Brief の生成数が常に0 | 中 |
| Rate limit を Upstash Redis に移行（OI-008） | MRR $500+ のフェーズで対応 | 中 |
