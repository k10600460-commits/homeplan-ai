# OI-007 調査・修正記録 — plan_generations INSERT 配線
**日付:** 2026-06-04  
**ブランチ:** `fix/plan-generations-insert-wiring-20260604`

---

## 1. 根本原因

### 調査結果

| 項目 | 状態 | 詳細 |
|------|------|------|
| `plan_generations` INSERT | ✅ 実装済み | `dee5a0e`（2026-06-01）で配線済み。実DB に 1 行確認（`2026-06-01 11:10:27 UTC`）。 |
| INSERT RLS 整合性 | ✅ 問題なし | RLS ポリシー `with check (auth.uid() = user_id)` と SSR クライアント（ユーザーセッション）が整合。 |
| INSERT スキーマ整合性 | ✅ 問題なし | 全 NOT NULL カラム（`lot_size`, `budget`, `family_size`, `plans`, `input_tokens`, `output_tokens`, `estimated_cost_usd`）を正しく供給。 |
| Daily Brief クエリ | ❌ **欠如** | `plan_generations` を一切クエリしていない → KPI ブロックに「生成数」が存在しない。 |
| `daily_brief_log.new_generations` | ❌ **カラム未存在** | `daily_brief_log` に `new_generations` カラムがなかった。 |

### 根本原因の結論

`dee5a0e` で INSERT は既に解決済み。**残っていた問題は Daily Brief が `plan_generations` を読まないこと** — クエリ自体が存在しないため生成数は常に 0（表示すらされない）状態だった。

---

## 2. 変更ファイルと差分要約

### `src/app/api/cron/daily-brief/route.ts`（+8行）

| 変更箇所 | 内容 |
|---------|------|
| `Promise.all` ブロック | `plan_generations` の 24h カウントクエリを追加（8つ目の Promise） |
| 変数抽出 | `const newGenerations = newGenerationsResult.count ?? 0;` |
| `buildDigestHtml` 呼び出し | `newGenerations,` を引数に追加 |
| `logPayload` | `new_generations: newGenerations,` を追加 |
| `DigestParams` interface | `newGenerations: number;` を追加 |
| `kpiRows` | `["Plans Generated (24h)", String(p.newGenerations)]` を `New Signups` の前に追加 |

### `supabase/migrations/20260604_daily_brief_log_add_generations.sql`（新規）

```sql
alter table daily_brief_log
  add column if not exists new_generations int not null default 0;
```

**DB 適用済み**（Supabase MCP ツールで適用完了 2026-06-04）。

---

## 3. 粒度の決定理由

1生成リクエスト（3案セット）= `plan_generations` 1行。Daily Brief のカウント側も `COUNT(*)` で行数を数えるため整合。匿名ユーザーは `/api/generate` に到達できない（認証チェックあり `generate/route.ts:62-64`）ため、全行が認証済みユーザーの生成。

---

## 4. 検証結果（ビルドチェック）

| 検証項目 | 結果 |
|---------|------|
| `npm run build` | ✅ 型エラーなし・ビルド成功 |
| DB マイグレーション適用 | ✅ `daily_brief_log.new_generations` カラム追加完了 |

### CC 環境では実行時テスト不可のため、founder が行う手動検証手順：

1. Vercel Preview（または本番）で `/dashboard` からプラン生成を 1 回実行
2. Supabase Dashboard → Table Editor → `plan_generations` に新規行が作成されることを確認（`created_at` が直近）
3. `https://splanai.com/api/cron/daily-brief?diag=1` に `Authorization: Bearer $CRON_SECRET` ヘッダーを付けて GET（または Vercel cron を手動トリガー）
4. 受信した Daily Brief メールの KPI ブロックに **「Plans Generated (24h)」が 1 以上** の値で表示されることを確認
5. Supabase → `daily_brief_log` テーブルで `new_generations` カラムに値が入っていることを確認

---

## 5. 残注意点

- `plan_generations` の INSERT は `dee5a0e` 以降の生成のみ記録。それ以前の生成データは存在しない（想定内）。
- Daily Brief の 24h ウィンドウは UTC 基準（`Date.now() - 24 * 60 * 60 * 1000`）。JST 8:00 実行の場合は前日 JST 8:00 〜 当日 JST 8:00 の生成が対象。
- `new_generations` の 1日平均が 0 の期間はユーザー未獲得フェーズの正常な状態。0 が表示されることはバグではない。

---

## 参照

- `src/app/api/generate/route.ts` — INSERT 実装（`dee5a0e`）
- `src/app/api/cron/daily-brief/route.ts` — Daily Brief クエリ・KPI（本 PR の変更）
- `supabase/migrations/20260517_customer_behavior_tracking.sql` — `plan_generations` スキーマ・RLS
- `supabase/migrations/20260529_daily_brief_tables.sql` — `daily_brief_log` 元スキーマ
- `supabase/migrations/20260604_daily_brief_log_add_generations.sql` — `new_generations` カラム追加
