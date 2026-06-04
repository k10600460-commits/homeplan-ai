# MLS/Trestle 連携 end-to-end 検証レポート
**日付:** 2026-06-04  
**方針:** read-only 検証。コード変更なし。推測不可 — 全判定に根拠ファイル・行を引用。

---

## 1. MLS 関連コードの所在

| ファイル | 役割 |
|---------|------|
| `src/app/api/mls/connect/route.ts` | Trestle トークン取得 → `mls_connections` 保存 |
| `src/app/api/mls/disconnect/route.ts` | `mls_connections` を disconnected に更新 |
| `src/app/api/mls/lot-data/route.ts` | トークン自動更新 + Trestle RESO OData 呼び出し |
| `src/app/api/mls/status/route.ts` | 接続ステータス確認 |
| `src/app/generate/GenerateClient.tsx` | MLS Listing ID 入力 UI、lot data 自動入力 |
| `src/app/dashboard/DashboardClient.tsx` | 接続/切断 UI（Pro/Team のみ表示） |
| `src/app/results/page.tsx` | MLS attribution バッジ表示 |
| `src/lib/crypto.ts` | AES-256-GCM 暗号化/復号 |
| `src/lib/rate-limit-db.ts` | `/api/mls/lot-data` で使われる DB レート制限 |

---

## 2. 接続フロー（OAuth authorize → token 交換 → 保存 → terms）

**判定: ✅ 実装済み&動作可**

Trestle の接続方式は **client_credentials grant**（ビルダーが自分の Trestle ClientID/Secret を入力）。Authorization Code フロー（リダイレクト）ではないため、OAuth コールバックルートは不要。この設計は B2B SaaS として正しい（各ビルダーが自分の MLS ライセンスを持ち込む）。

| ステップ | 実装箇所 | 状態 |
|---------|---------|------|
| Builder が ClientID + Secret を入力 | `DashboardClient.tsx:596-648` | ✅ |
| `agreed_to_terms` チェックボックス | `DashboardClient.tsx:623-628` | ✅ |
| `POST /api/mls/connect` | `connect/route.ts:34-124` | ✅ |
| `fetchTrestleToken()` — `https://api.trestle.com/connect/token` に client_credentials | `connect/route.ts:8-32` | ✅ |
| `AES-256-GCM` で `client_id`, `client_secret`, `access_token` を暗号化 | `connect/route.ts:79-81` | ✅ |
| `mls_connections` upsert（`user_id,provider` 複合 unique） | `connect/route.ts:84-98` | ✅ |
| `status: "active"`, `agreed_to_terms: true`, `connected_at` を設定 | `connect/route.ts:93-95` | ✅ |
| Pro/Team プランゲート（Free は 403） | `connect/route.ts:43-49` | ✅ |

---

## 3. トークン更新（token_expires_at チェック + refresh）

**判定: ✅ 実装済み&動作可**

`lot-data/route.ts:31-73` に `refreshToken()` 関数が実装されている。

- `token_expires_at` が未設定 or `Date.now() > expiresAt - 5分` の場合に自動リフレッシュ（`lot-data/route.ts:129-138`）。
- リフレッシュ後、`mls_connections` に新 `access_token_encrypted` と `token_expires_at` を UPDATE。
- Trestle の `expires_in` は通常 1時間（3600秒）。

---

## 4. データ取得 → プラン生成への流し込み

**判定: 部分実装（lot size のみ → generate 経由; zoning は未使用）**

### 実装されている部分

| パス | 実装箇所 | 状態 |
|-----|---------|------|
| `GET /api/mls/lot-data?listingId=...` | `lot-data/route.ts` | ✅ |
| Trestle RESO OData `Property` エンドポイント | `lot-data/route.ts:142-148` | ✅ |
| 返却フィールド: `ListingId`, `LotSizeArea`, `Zoning`, `ListPrice`, `City`, `StateOrProvince` 等 | `lot-data/route.ts:14-29` | ✅ |
| IDX コンプライアンス: `InternetEntireListingDisplayYN = false` の場合に 403 | `lot-data/route.ts:182-186` | ✅ |
| `lot-data` レスポンスで `lotSizeArea`, `city`, `state` を generate フォームに自動入力 | `GenerateClient.tsx:70-75` | ✅ |
| results ページに MLS attribution/disclaimer バッジ表示 | `results/page.tsx:861-873` | ✅ |

### 実装されていない部分（ギャップ）

| ギャップ | 根拠 |
|---------|------|
| **`zoning` が generate プロンプトに渡されない** | `lot-data/route.ts:196` で zoning を返すが、`GenerateClient.tsx` は `form` オブジェクト（lotSize/budget/familySize/city/state/street）のみを `/api/generate` に POST。`generate/route.ts` に zoning 参照なし。 |
| **results の zoning 表示がハードコード** | `results/page.tsx:1228`：`<p className="text-sm text-gray-400">Zoning: R-1 Single Family</p>` — MLS 実データではなく固定テキスト。 |
| **`street` フィールドの MLS 連携なし** | `GenerateClient.tsx:239`："coming soon" のラベルあり。MLS の `UnparsedAddress` は `address` フィールドとして返るが、フォームの `street` に自動入力されない。 |
| **MLS listing price・property type が generate プロンプト未使用** | budget 入力は手動のまま。`ListPrice` は返却されるが使われていない。 |

---

## 5. 監査ログ（mls_audit_logs への書き込み）

**判定: ❌ 未実装（スキーマ不整合で全件サイレント失敗）**

コードが INSERT しようとしているカラムと、実際の DB スキーマが一致しない。

### 実際の `mls_audit_logs` スキーマ（DB 確認済み）

```
id, user_id, action (NOT NULL), mls_id, property_id, result, metadata (NOT NULL, default '{}'), ip_hash, created_at
```

### コードが INSERT しようとしているカラム

| INSERT箇所 | コードが使うカラム | DB に存在するか |
|-----------|----------------|--------------|
| `connect/route.ts:102-109` | `user_id`, `provider`, `endpoint`, `action_type`, `response_status`, `ip_hash` | `provider` ❌ `endpoint` ❌ `action_type` ❌ (`action` が正しい) `response_status` ❌ |
| `disconnect/route.ts:31-38` | 同上 | 同上 |
| `lot-data/route.ts:64-69` (refresh) | `user_id`, `provider`, `endpoint`, `action_type`, `response_status` | 全て❌ |
| `lot-data/route.ts:151-160` (lot fetch) | `user_id`, `provider`, `endpoint`, `mls_listing_id`, `action_type`, `response_status`, `ip_hash` | `provider` ❌ `endpoint` ❌ `mls_listing_id` ❌ (`mls_id` が正しい) `action_type` ❌ `response_status` ❌ |

**結論**: `action` (NOT NULL) が省略されており、さらに存在しないカラム名を指定しているため、すべての audit log INSERT は Supabase から `column "action_type" of relation "mls_audit_logs" does not exist` エラーを返す。全て `.then(() => {}, console.error)` で非同期・非ブロッキングなため、メインフローは壊れないが、**監査ログは 1行も書かれていない状態**。

---

## 6. 暗号化と鍵管理

**判定: ✅ 実装済み。本番 Vercel に AES_ENCRYPTION_KEY 設定済み**

| 項目 | 内容 | 状態 |
|-----|------|------|
| アルゴリズム | AES-256-GCM (`crypto.ts:1`) | ✅ |
| フォーマット | `iv:tag:ciphertext`（全て hex）(`crypto.ts:22`) | ✅ |
| 鍵要件 | 64文字 hex（32バイト）(`crypto.ts:9`) | ✅ |
| `AES_ENCRYPTION_KEY` | Vercel production + preview に設定済み（確認済み） | ✅ |
| IP ハッシュ | `hashIp()` で SHA-256 one-way hash。生 IP は保存しない | ✅ |

---

## 7. 必要な環境変数一覧

Trestle 固有の env var は**不要**（ビルダーが自分のクレデンシャルを入力し、DB に暗号化保存する設計）。

| 変数名 | 用途 | Vercel 設定状況 | 未設定時の影響箇所 |
|--------|------|----------------|-----------------|
| `AES_ENCRYPTION_KEY` | client_id/secret/token の暗号化/復号 | ✅ production + preview | `connect/route.ts:7-12`: `throw new Error("AES_ENCRYPTION_KEY must be...")` → connect/lot-data 全て 500 エラー |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 接続 | ✅ | 全機能停止 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon client | ✅ | 認証不能 |
| `SUPABASE_SERVICE_ROLE_KEY` | rate-limit-db (lot-data レートリミット) | ✅ | レートリミットがフェイルオープン（許可し続ける） |

---

## 8. Trestle サンドボックス／テスト実測

**判定: テスト実施不可（実資格情報必須）**

コード内 URL は `https://api.trestle.com/connect/token`（本番）。Trestle には [sandbox 環境](https://trestle.corelogic.com) が存在するが、利用には MLS ライセンス保有者が Trestle に申請してサンドボックス ClientID/Secret を取得する必要がある。現在 DB の `mls_connections` は 0 行のため、実測不可。

### Founder が踏む手動検証手順（Trestle credentials 取得後）

1. **Trestle sandbox 取得**: `https://trestle.corelogic.com` → デベロッパーポータルで sandbox ClientID/Secret を申請。
2. **接続テスト**: `/dashboard` → 「MLS via Trestle」セクション → ClientID/Secret 入力 → 「Connect MLS via Trestle」。
3. **DB 確認**: Supabase → `mls_connections` に 1行追加・`status = active` であることを確認。
4. **Lot data テスト**: `/generate` でサンドボックスの Listing ID を入力 → 「Fetch」→ フォームに `lotSize`, `city`, `state` が自動入力されることを確認。
5. **Audit log 確認（現状はバグあり）**: `mls_audit_logs` は現状 0 行のまま（スキーマ不整合のため）。
6. **切断テスト**: `/dashboard` → 「Disconnect」→ `mls_connections.status = disconnected` を確認。

---

## 未完箇所一覧（修正は別 /goal で）

| ID | 箇所 | 重要度 | 内容 |
|----|------|--------|------|
| G-MLS-01 | `connect/route.ts:102-109`, `disconnect/route.ts:31-38`, `lot-data/route.ts:64-69,151-160` | **高** | `mls_audit_logs` INSERT が全件失敗（`action_type`→`action`, `mls_listing_id`→`mls_id`, `provider`/`endpoint`/`response_status` は非存在カラム） |
| G-MLS-02 | `GenerateClient.tsx:70-75` | 中 | `zoning` が auto-fill されず、generate プロンプトにも渡らない。`lot-data/route.ts` は `Zoning` を返している。 |
| G-MLS-03 | `results/page.tsx:1228` | 中 | Zoning 表示が `"R-1 Single Family"` ハードコード。MLS 実データ未使用。 |
| G-MLS-04 | `GenerateClient.tsx:229-239` | 低 | `street` フィールドに MLS の `UnparsedAddress` が自動入力されない（"coming soon" ラベルあり）。 |
| G-MLS-05 | (設計上の問題) | 低 | MLS `ListPrice` が generate の `budget` に自動提案されない。 |

---

## 総括：MLS 連携は今「売れる状態」か

**半分イエス、半分ノー。**

コアフロー（Trestle への client_credentials 認証 → 暗号化保存 → lot data 取得 → generate フォーム自動入力）は実装されており、`AES_ENCRYPTION_KEY` も本番 Vercel に設定済み。ビルダーが自分の Trestle クレデンシャルを持ち込めば、接続・lot data 取得・プラン生成は end-to-end で動作するはず。

ただし、**監査ログが完全に壊れている**（G-MLS-01）のは IDX コンプライアンス上の欠陥で、実ユーザーに提供するには修正が必要。また、MLS データの活用が `lotSizeArea` の auto-fill に留まり、zoning・price 等が generate プロンプトに渡っていないため、「MLS 連携でプランの精度が上がる」という訴求には実態が伴わない（G-MLS-02, 03）。

**プロビルダーへの目玉として打ち出して安全か**: 接続フローを "MLS Listing ID を入れると lot size が自動入力される" と説明する範囲では安全。「MLS データでプランの精度が上がる」という訴求は、zoning を generate に渡す G-MLS-02 を修正してからでないと誇張になる。監査ログ修正（G-MLS-01）は本番稼働前の必須作業。
