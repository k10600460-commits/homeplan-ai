# MLS 監査ログ修正 + Zoning generate 活用
**日付:** 2026-06-04  
**ブランチ:** `fix/mls-audit-and-zoning-20260604`  
**目的:** G-MLS-01（mls_audit_logs INSERT スキーマ不整合）と G-MLS-02（zoning が generate プロンプト未使用）を最小差分で修正。main マージ・本番デプロイはしない。

---

## G-MLS-01：監査ログ INSERT スキーマ不整合

### 根本原因

`mls_audit_logs` テーブルの実スキーマ（`supabase/migrations/20260517_mls_audit_logs.sql`）と、4箇所のコードが INSERT しようとしていた列名が全て不一致だった。

**実スキーマ（DB確認済み）:**
```
id, user_id, action (NOT NULL), mls_id, property_id, result, metadata (jsonb, NOT NULL, default '{}'), ip_hash, created_at
```

**コードが使っていた（存在しない）列:**
- `action_type` → 正しくは `action`
- `mls_listing_id` → 正しくは `mls_id`
- `provider` → DB列なし → `metadata` に格納
- `endpoint` → DB列なし → `metadata` に格納
- `response_status` → DB列なし → `metadata` に格納

全てのINSERTは `.then(() => {}, console.error)` で非ブロッキングになっており、エラーが黙殺され続けていた。

### 方針選択：(A) 既存スキーマに合わせる

- **(A) 採用**: 既存の DB スキーマに合わせてコードを修正。マイグレーション不要・最小差分。
- **(B) 却下**: `provider`/`endpoint`/`response_status` を列として migration 追加する案。IDX コンプライアンスの報告要件で個別列クエリが必須になった場合のみ選択すべき。現状は metadata jsonb に格納で十分。

### 変更内容（マイグレーション不要）

| 変更箇所 | 内容 |
|---------|------|
| `connect/route.ts:102-109` | `action_type`→`action:"connect"`, `provider`/`endpoint`→`metadata`, `response_status`を削除 |
| `disconnect/route.ts:31-38` | 同様。`action:"disconnect"` |
| `lot-data/route.ts:64-69` (token refresh) | `action_type`→`action:"token_refresh"`, metadata に provider を格納 |
| `lot-data/route.ts:151-160` (lot fetch) | `action:"lot_data"`, `mls_listing_id`→`mls_id`, metadata に provider/response_status を格納 |

**修正後の INSERT 例（lot_data）:**
```typescript
supabase.from("mls_audit_logs").insert({
  user_id:  user.id,
  action:   "lot_data",
  mls_id:   listingId,
  metadata: { provider: "trestle", response_status: trestleRes.status },
  ip_hash:  hashIp(getClientIp(req)),
}).then(() => {}, (e) => console.error("[MLS audit]", e));
```

### DB 実動作確認（本 PR の一環として実施）

修正後スキーマに合わせた INSERT をテスト実行（`action:"lot_data"`, `mls_id:"TEST-LISTING-001"`, `metadata:{"provider":"trestle","response_status":200}`）→ 1行挿入成功（`id:7a49dac9-...`）→ DELETE で原状復帰。**INSERT は正常動作することを確認。**

---

## G-MLS-02：Zoning を generate プロンプトへ

### 根本原因

`lot-data/route.ts` は `Zoning` フィールドを Trestle から取得して `zoning` として返しているが、下流のすべての箇所で未使用だった：

- `GenerateClient.tsx` の `MlsLotData` インターフェースに `zoning` 未定義
- `handleSubmit()` が `form` オブジェクトのみを POST → zoning が `/api/generate` に届かない
- `generate/route.ts` の Claude ユーザープロンプトに zoning 参照なし

### 変更内容

**`GenerateClient.tsx`（+1行）**  
`MlsLotData` インターフェースに `zoning?: string` を追加。

**`GenerateClient.tsx`（+3行）**  
`handleSubmit()` の POST body に `mlsZoning: mlsLotData?.zoning` を追加（MLS接続なし・zoning 未取得時はキー自体を送らない）：
```typescript
body: JSON.stringify({
  ...form,
  ...(mlsLotData?.zoning ? { mlsZoning: mlsLotData.zoning } : {}),
}),
```

**`generate/route.ts`（+5行）**  
`validateGenerateInput` 後に `rawBody.mlsZoning` を取り出してサニタイズ（英数字/スペース/`-`/`/` のみ残す、最大 100 文字）し、Claude ユーザープロンプトに条件付き挿入：
```typescript
const rawZoning = typeof rawBody.mlsZoning === "string" ? rawBody.mlsZoning : "";
const mlsZoning = rawZoning.replace(/[^a-zA-Z0-9 \-\/]/g, "").slice(0, 100).trim();
const zoningLine = mlsZoning ? `- Zoning: ${mlsZoning} (from MLS — ensure plans comply with this designation)\n` : "";
```

**MLS未接続時の動作**: `mlsLotData` が null のため `mlsZoning` キーが POST されず、`rawBody.mlsZoning` は `undefined` → `mlsZoning` は空文字 → `zoningLine` は空 → 従来と全く同じプロンプトが生成される。**既存フローに regression なし。**

---

## 検証

| 検証項目 | 結果 |
|---------|------|
| `npm run build` | ✅ 型エラーなし・ビルド成功 |
| G-MLS-01 DB INSERT テスト | ✅ 1行挿入成功・削除で原状復帰 |
| G-MLS-02 コードパス確認 | ✅ zoning あり → `zoningLine` にプロンプト挿入；zoning なし → 空文字・従来動作 |
| MLS未接続ユーザーへの regression | ✅ なし（条件分岐で従来動作を維持） |

---

## Founder 手動検証手順（デプロイ後）

### G-MLS-01（監査ログ）
1. Pro/Team アカウントで Dashboard → MLS 接続を実行
2. Supabase → `mls_audit_logs` テーブルに `action = "connect"` の行が追加されることを確認
3. `/generate` で MLS Listing ID を入力 → Fetch → 生成
4. `mls_audit_logs` に `action = "lot_data"`, `mls_id = {listingId}`, `metadata.response_status = 200` の行が追加されることを確認

### G-MLS-02（zoning）
1. Pro/Team アカウントで MLS Listing ID から Fetch
2. MLS データに `zoning` が含まれる listing であれば、生成プランが zoning 指定に言及するか確認（例：「R-1 Single Family」なら single-family プランが生成される）
3. MLS未接続ユーザーで通常生成が従来どおり動作することを確認

---

## 残注意点

- G-MLS-03（`results/page.tsx:1228` の Zoning ハードコード）は別 PR で対応。G-MLS-02 でプロンプトには zoning が渡るが、results ページのラベルは依然 "R-1 Single Family" 固定のまま。
- G-MLS-04（street フィールド MLS 連携）・G-MLS-05（ListPrice → budget 提案）は低優先度・別 PR。
- `metadata` jsonb への格納は Supabase ダッシュボードの Table Editor でも `metadata->>provider` でクエリ可能。

---

## 変更ファイルまとめ

| ファイル | 変更行数（概算） |
|---------|---------------|
| `src/app/api/mls/connect/route.ts` | −6 / +5 |
| `src/app/api/mls/disconnect/route.ts` | −6 / +4 |
| `src/app/api/mls/lot-data/route.ts` | −9 / +7 |
| `src/app/generate/GenerateClient.tsx` | +1 (interface) / +3 (POST body) |
| `src/app/api/generate/route.ts` | +5 |
| `docs/launch/mls-audit-zoning-fix-20260604.md` | 本ファイル（新規） |
