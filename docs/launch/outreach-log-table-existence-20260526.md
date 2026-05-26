# outreach_log テーブル存在確認

**調査日**: 2026-05-26  
**調査者**: /investigate skill

---

## Question

outreach_log テーブルが Supabase のスキーマに実在するか。存在するならカラム定義と用途、存在しないなら「未作成」と明記。

---

## Answer

**実在する。** `public.outreach_log` は本番 Supabase DB（project: `sabriblwzzsvxsfxoebe`）に存在する。現時点のレコード数は **0 行**（アウトレーチ未着手）。

---

## Evidence

### 1. マイグレーション適用済み（リモート DB で確認）

`mcp__supabase__list_migrations` の結果:

```json
{ "version": "20260520132407", "name": "post_launch_tables" }
```

ローカルファイル `supabase/migrations/20260522_post_launch_tables.sql` が migration `20260520132407` として本番 DB に適用済み。

### 2. テーブル一覧に存在（リモート DB で確認）

`mcp__supabase__list_tables` の結果（抜粋）:

```json
{ "name": "public.outreach_log", "rls_enabled": true, "rows": 0 }
```

### 3. カラム定義（`information_schema.columns` から直接取得）

| カラム名 | 型 | NOT NULL | デフォルト |
|----------|----|---------:|-----------|
| `id` | uuid | ✅ | `gen_random_uuid()` |
| `company_name` | text | ✅ | — |
| `contact_name` | text | — | — |
| `contact_email` | text | — | — |
| `contact_linkedin` | text | — | — |
| `state` | text | — | — |
| `annual_volume` | integer | — | — |
| `source` | text | — | — |
| `dm_pattern` | text | — | — |
| `status` | text | ✅ | `'pending'` |
| `sent_at` | timestamptz | — | — |
| `replied_at` | timestamptz | — | — |
| `notes` | text | — | — |
| `created_at` | timestamptz | ✅ | `now()` |
| `updated_at` | timestamptz | ✅ | `now()` |

カラム定義は `supabase/migrations/20260522_post_launch_tables.sql:18-35` の DDL と完全一致。

### 4. コード参照（`sales-dm-draft/route.ts`）

`src/app/api/cron/sales-dm-draft/route.ts:19` で接続確認クエリが実装済み:

```ts
const { error } = await supabase.from("outreach_log").select("id").limit(1);
if (error) {
  return NextResponse.json({ error: "DB connection failed" }, { status: 500 });
}
```

ただしこの route.ts は **スケルトン実装**（行 32 にコメントあり）。DM 生成・保存ロジックは "Week 1 post-launch" 実装予定。

### 5. RLS ポリシー

`service_role` のみ書き込み可。フロントエンドからの直接アクセス不可（DDL: `create policy "service_role_all" on outreach_log for all using (auth.role() = 'service_role')`）。

---

## Assumptions & gaps

- **migration のタイムスタンプ不一致**: ローカルファイル名は `20260522_post_launch_tables.sql`（22日付け）だが、DB の version は `20260520132407`（20日）。ローカルファイルのリネーム or 別途手動適用の可能性がある。事実には影響しないが記録しておく。
- **インデックス・トリガーの存在**: DDL には `outreach_log_updated_at` トリガーと 3 つのインデックス（status / state / sent_at）が定義されているが、DB 上での実在は `information_schema` では確認していない。テーブル本体の存在は確認済み。

---

## Implications

- `agents/sales.md §2` および `obsidian-vault/master-todo-post-launch.md §3.1.1` で参照している `outreach_log` テーブルは**すでに本番 DB に存在する**。Sales Agent の Cron が起動すれば即座にクエリ可能な状態。
- `sales-dm-draft/route.ts` は現時点でスケルトン（DB 接続確認のみ）。DM 生成ロジックの実装が完了すれば、テーブルへの insert/update が動き始める。
- 先行して `outreach_log` に見込み客データを手動 insert することで、Cron が実装完了前でも営業リストの管理を開始できる。
- `post-launch-sales-20260526.md` の「未確認」記載は本調査で**クローズ**：テーブルは実在する。
