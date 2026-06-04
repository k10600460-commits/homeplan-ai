# 2026-06-04 マージ後 オープンイシュー（累積）
**日付:** 2026-06-04（最終更新: docs/post-merge-records-mls-lp-20260604）  
**対象 PR:** #13, #15, #16, #17 + LP コピー fix ブランチ

---

## 解決済み

| ID | 課題 | PR / commit |
|----|------|-------------|
| OI-R30 | plan_generations Daily Brief 配線（OI-007） | PR#16 `8d85c4b` |
| OI-R27 | MLS Zoning → generate プロンプト未使用（OI-021）| PR#17 `7ca3981` |
| OI-R26 | MLS 監査ログ INSERT スキーマ不整合（OI-020） | PR#17 `7ca3981` |
| OI-R29 | LP コピー: streetHint coming-soon 削除・デモ金利 7%→~6.5%・MLS Pro 差別化強化 | `fix/lp-mls-copy-zoning-rate-20260604` |
| OI-R28 | 住宅ローン金利「現在値基準」read-only 検証 → 正常（FRED live, スナップショット設計通り） | 調査のみ |
| OI-R25 | legacy `nearbysearch/json` フォールバック削除（DEAD コード除去） | PR#15 `4b7f998` |
| OI-R24 | 住宅ローン金利 7.0% ハードコード → FRED MORTGAGE30US ライブ取得 | PR#13 `4add9fb` |
| OI-R23 | 共有ポータルに近隣・市場データが未表示 → Phase2 実装・DB マイグレーション | PR#13 `c334fb0` |
| OI-R22 | 近隣データが全ゼロ件（`REQUEST_DENIED` を空配列に変換していたバグ） | PR#13 `8585f77` |
| OI-R21 | ブログ記事タイトル H1 が2重表示 → render-time strip | PR#13 `3aecc5c` |

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

### ~~OI-019 GCP 旧 "Places API" の有効化 or legacy フォールバック削除~~ **【Resolved 2026-06-04 — PR#15 `4b7f998`】**

option (b) を採用。`GoogleNearbyResponse` インターフェースと legacy `nearbysearch/json` フォールバックブロックを削除（-18行+3行）。`npm run build` ✅。

---

## 継続オープン

| ID | 課題 | 状態 | 優先度 |
|----|------|------|--------|
| OI-018 | コンセプト画像を実写 JPEG に差し替え（`public/concept-styles/` 6枚） | founder 作業待ち | 高 |
| OI-022 | `results/page.tsx:1228` Zoning ラベルハードコード "R-1 Single Family" | 別 PR | 低 |
| OI-023 | MLS 真の end-to-end（実ライセンス接続・zoning 反映確認） | 実ビルダー接続待ち | — |
| OI-024 | 共有ポータル financials スナップショット：初回実データ確認 | 本番利用後 | 低 |
| OI-008 | Rate limit を Upstash Redis に移行 | MRR $500+ フェーズ | 中 |
| — | ポータルに生成日表示がない | `shared_links.created_at` あり・フッター表示のみ | 低 |
| — | RentCast 上限到達時のキャッシュなし | 50件/月の月末リスク | 低 |
| — | `estimatedCost` が地域別コストを反映しない | 免責テキスト表示で許容 | 低 |

---

## 参照ドキュメント

- `docs/launch/mls-trestle-verification-20260604.md` — MLS/Trestle end-to-end 検証記録
- `docs/launch/mls-audit-zoning-fix-20260604.md` — G-MLS-01/02 修正記録（PR#17）
- `docs/launch/lp-copy-fixes-20260604.md` — LP コピー 3点修正記録
- `docs/launch/mortgage-rate-basis-verification-20260604.md` — 金利「現在値基準」検証記録
