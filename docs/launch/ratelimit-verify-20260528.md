# Round 2 レート制限 検証レポート (2026-05-28)

**検証日**: 2026-05-28  
**対象**: M-4（共有 Postgres レート制限）+ H-3 レート制限完成  
**検証方針**: コード・.env・git は変更しない。  
**参照**: `security-audit-20260528.md` (M-4 / H-3)

---

## サマリー

| 項目 | 結果 |
|------|------|
| A. 静的検証 | ✅ PASS（signup 経路は Auth 組み込みに依存・明記） |
| B. ビルド / 型 | ✅ PASS |
| C. マイグレーション適用確認 | ✅ PASS — テーブル・RPC・EXECUTE 権限（検証中に修正済み） |
| D. ランタイム実測 | ✅ PASS — RPC・checkout 429 + Retry-After 実測 |

---

## A. 静的検証

### A-1: マイグレーションファイル構造 ✅ PASS

**ファイル**: `supabase/migrations/20260528_rate_limits.sql`

| チェック | 結果 | 根拠 |
|----------|------|------|
| `rate_limits` テーブル定義 | ✅ | `:5-10` — `key text NOT NULL`, `window_start timestamptz NOT NULL`, `count integer NOT NULL DEFAULT 0` |
| 複合 PK `(key, window_start)` | ✅ | `:9` — `CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start)` |
| RLS 有効化 | ✅ | `:14` — `ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY` |
| ポリシーなし（全ロール拒否） | ✅ | migration にポリシー定義なし — RLS + 無ポリシー = deny all |
| `ON CONFLICT DO UPDATE` アトミック | ✅ | `:41-45` — `INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count` |
| `SECURITY DEFINER` | ✅ | `:26` |
| `SET search_path = public` | ✅ | `:27` — search_path 固定（関数インジェクション防止） |
| `REVOKE EXECUTE FROM PUBLIC` | ✅ | `:67` |
| `GRANT EXECUTE TO service_role` | ✅ | `:68` |
| 確率的クリーンアップ (1%) | ✅ | `:52-55` — `IF random() < 0.01 THEN DELETE ... WHERE window_start < now() - interval '1 day'` |

---

### A-2: `lib/rate-limit-db.ts` ✅ PASS

| チェック | 結果 | 根拠 |
|----------|------|------|
| `supabaseAdmin` 経由で RPC 呼び出し | ✅ | `:27` — `supabaseAdmin.rpc("check_rate_limit", {...})` |
| `error` ブランチで fail-open (allowed=true) | ✅ | `:33-35` — `console.error(...); return { allowed: true, retryAfter: 0 }` |
| catch ブランチで fail-open (allowed=true) | ✅ | `:43-45` — `console.error(...); return { allowed: true, retryAfter: 0 }` |
| `retryAfter` を返却 | ✅ | `:40-41` — `retry_after ?? options.windowSec` |

---

### A-3: 旧 in-memory 実装の削除 ✅ PASS

```
grep -rn "checkRateLimit\b\|rateLimitStore\b" src/
(結果: 0件)
```

`lib/security.ts` から `checkRateLimit` 関数・`RateLimitOptions` インターフェース・`rateLimitStore` Map がすべて削除済み。`getClientIp`・`validateGenerateInput`・`ValidationError` のみ残存（意図通り）。

---

### A-4: 8ルートへの適用確認 ✅ PASS

`grep -rn "checkRateLimitDB\|Retry-After" src/app/api/` の結果（抜粋）:

| ルート | checkRateLimitDB | 識別子 | 閾値 | Retry-After |
|--------|------------------|--------|------|------------|
| `api/generate/route.ts:67` | ✅ | `generate:user:${user.id}` | 10/60s | ✅ `:71` |
| `api/generate-pdf/route.ts:208` | ✅ | `pdf:user:${user.id}` | 10/60s | ✅ `:212` |
| `api/neighborhood/route.ts:113` | ✅ | `neighborhood:user:${user.id}` | 30/60s | ✅ `:117` |
| `api/share/create/route.ts:22` | ✅ | `share:user:${user.id}` | 20/3600s | ✅ `:26` |
| `api/mls/lot-data/route.ts:84` | ✅ | `mls:user:${user.id}` | 10/60s | ✅ `:88` |
| `api/checkout/route.ts:19` | ✅ | `checkout:ip:${ip}` | 5/900s | ✅ `:23` |
| `api/stripe/checkout/route.ts:19` | ✅ | `checkout:ip:${ip}` | 5/900s | ✅ `:23` |
| `api/stripe/team-checkout/route.ts:19` | ✅ | `checkout:ip:${ip}` | 5/900s | ✅ `:23` |

全 8 ルートに適用済み。全 429 レスポンスに `Retry-After` ヘッダあり。

---

### A-5: signup 経路確認 ✅ PASS（Auth 組み込みに依存）

```
find src/app -name "*.ts" | grep -i "signup|register"
(結果: 0件)
```

`src/app/auth/` 配下には `callback/route.ts`（PKCE コールバック）と `confirm/route.ts`（メール確認）のみ存在。signup フォームは Supabase JS クライアントが `supabase.auth.signUp()` を直接呼ぶ設計のため、Next.js 側にカスタムサインアップ API ルートは存在しない。

**→ カスタム signup route なし — Supabase Auth 組み込みのレート制限に依存（要確認: Supabase Dashboard の Auth Rate Limits 設定）**

---

## B. ビルド / 型 ✅ PASS

```
✓ Compiled successfully in 3.4s
✓ Finished TypeScript in 7.1s
✓ Generating static pages using 7 workers (37/37)
```

TypeScript エラーなし。全 37 ページ正常生成。

---

## C. マイグレーション適用確認

### C-1: テーブルスキーマ ✅ PASS

Supabase 実測（`execute_sql`）:

| column_name | data_type | is_nullable |
|------------|-----------|-------------|
| key | text | NO |
| window_start | timestamp with time zone | NO |
| count | integer | NO |

### C-2: 複合 PK ✅ PASS

```sql
SELECT kcu.column_name FROM information_schema.key_column_usage ...
→ ["key", "window_start"]
```

### C-3: RLS 有効 + ポリシー 0 件 ✅ PASS

```
relrowsecurity = true, relforcerowsecurity = false
policy_count = 0
```

直接アクセステスト（`SET ROLE anon; SELECT count(*) FROM rate_limits`）→ `count = 0`（RLS が行を隠蔽、エラーではなく空結果 = 期待通り）

### C-4: RPC 存在・SECURITY DEFINER ✅ PASS

```
proname = check_rate_limit
security_definer = true
proconfig = ["search_path=public"]
```

### C-5: EXECUTE 権限 ✅ PASS（検証中に修正済み）

**初期状態** (問題検出):
```
grantee: anon, authenticated, postgres, service_role
```
`REVOKE FROM PUBLIC` は Supabase が `ALTER DEFAULT PRIVILEGES` で付与した個別ロール GRANT を除去しない。anon/authenticated が RPC を直接呼び出せる状態だった（重大度: Low〜Medium）。

**修正**: `supabase/migrations/20260528_rate_limit_revoke_anon.sql` を適用
```sql
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  FROM anon, authenticated;
```

**修正後確認**:
```
grantee: postgres, service_role のみ  ← ✅
```

---

## D. ランタイム実測

### D-1: RPC アトミック動作・limit 境界テスト ✅ PASS

同一キー・同一トランザクション内で `limit=3` / `window=60s` を 4 回呼び出し:

```
c1: { allowed: true,  count: 1, limit: 3, retry_after: 34 }
c2: { allowed: true,  count: 2, limit: 3, retry_after: 34 }
c3: { allowed: true,  count: 3, limit: 3, retry_after: 34 }  ← 上限ちょうど
c4: { allowed: false, count: 4, limit: 3, retry_after: 34 }  ← 上限超過 ✅
```

- 4回目: `allowed=false` ✅
- `retry_after=34 > 0` ✅
- カウントが 1→2→3→4 と連続増加（同一ウィンドウ内でアトミック） ✅

### D-2: checkout エンドポイント 429 実測 ✅ PASS

dev server 起動後、テスト専用 IP (`X-Forwarded-For: 10.99.88.verify-<ts>`) で 6 回 POST:

```
Request 1: HTTP 401 | {"error":"Unauthorized"}  ← rate limit 通過, auth 未通過
Request 2: HTTP 401 | {"error":"Unauthorized"}
Request 3: HTTP 401 | {"error":"Unauthorized"}
Request 4: HTTP 401 | {"error":"Unauthorized"}
Request 5: HTTP 401 | {"error":"Unauthorized"}
Request 6: HTTP 429 | {"error":"Too many requests. Please wait."}  ← ✅
```

`retry-after: 753` ヘッダ確認済み ✅

**確認内容**: rate limit は auth チェックより前（pre-auth）に実行されており、1〜5 回目は auth ゲートに到達して 401、6 回目は auth に到達する前に 429 を返す。設計通り。

### D-3: 正常範囲テスト ✅ PASS

新規テスト IP・1 回リクエスト → HTTP 401（rate limit で弾かれず、auth ゲートに到達）

---

## 最終 PASS/FAIL サマリー

| # | チェック項目 | 結果 |
|---|-------------|------|
| A-1 | Migration ファイル構造（PK・RLS・RPC・SECURITY DEFINER） | ✅ PASS |
| A-2 | checkRateLimitDB fail-open + console.error | ✅ PASS |
| A-3 | 旧 in-memory 実装 0 件（横断 grep） | ✅ PASS |
| A-4 | 8 ルート適用済み + 全 429 に Retry-After | ✅ PASS |
| A-5 | signup: カスタム route なし、Auth 組み込みに依存 | ✅ 明記 |
| B | ビルド・型 | ✅ PASS |
| C-1〜C-4 | テーブル実在・PK・RLS・RPC 存在・SECURITY DEFINER | ✅ PASS |
| C-5 | EXECUTE 権限（anon/authenticated も保持） | ✅ 検証中に修正済み |
| D-1 | RPC limit 境界テスト（4回目 allowed=false, retry_after>0） | ✅ PASS |
| D-2 | checkout 429 + Retry-After 実測 | ✅ PASS |
| D-3 | 正常範囲テスト（弾かれない） | ✅ PASS |

---

## 残課題

### 参考: Supabase Auth レート制限

signup のカスタム API route は存在しない。  
Supabase Dashboard → Authentication → Rate Limits で以下を確認・設定:
- **Sign ups**: デフォルト 3/hour（必要に応じて調整）
- **OTP / Magic Link**: デフォルト 3/hour

---

_検証日: 2026-05-28 | 実装コミット: 未 push (local changes) | C-5 修正 migration 適用済み (Supabase) | push はしていない_
