# Supabase 自動化テーブル群 — 仕様調査

**Date:** 2026-05-28  
**Question:** supabase/migrations/ 内で outreach_log / support_tickets / finance_snapshots / seo_articles / legal_watch_diffs を定義しているマイグレーションと、これらを参照するコード（特に sales-dm-draft 関連、outreach_log の status/dm_pattern の取り得る値、RLS ポリシー）を洗い出し、各テーブルの「想定ステータス値・用途・参照箇所」を表で報告。

---

## Answer

5テーブルはすべて単一マイグレーションファイルで定義されている。現時点のコードは **接続テストのみ** で、INSERT/UPDATE は未実装（Week 1 post-launch 予定）。RLS は全テーブル `service_role` 専用。

---

## Evidence — テーブル一覧

| テーブル | 定義ファイル | 参照コード |
|---|---|---|
| outreach_log | `supabase/migrations/20260522_post_launch_tables.sql` L16–49 | `src/app/api/cron/sales-dm-draft/route.ts` |
| seo_articles | 同上 L52–79 | `src/app/api/cron/seo-draft/route.ts` |
| support_tickets | 同上 L82–110 | なし（cron skeleton も未作成） |
| finance_snapshots | 同上 L113–138 | `src/app/api/cron/finance-snapshot/route.ts` |
| legal_watch_diffs | 同上 L141–166 | `src/app/api/cron/legal-watch/route.ts` |

---

## Evidence — ステータス値・用途

### outreach_log

**status**（L28–29）:
```
pending → sent → replied → qualified → demo_done → trial_started → paid
                                                  ↓
                                              disqualified
```
値: `pending` / `sent` / `replied` / `qualified` / `demo_done` / `trial_started` / `paid` / `disqualified`

**dm_pattern**（L27）:

| 値 | 意味 |
|---|---|
| `A_followup` | 追客漏れ減らせます |
| `B_salesforce` | 営業1人分削減 |
| `C_mls_revenue` | MLS をもっと売上化 |
| `D_visit_rate` | 来場率改善 |
| `E_revival` | 失注復活 |

パターン選択ロジックは `agents/sales.md` L158–174 に記載（コードには未実装）。

**その他カラム**: company_name / contact_name / contact_email / contact_linkedin / state / annual_volume / source(google_maps|nahb_directory|linkedin|inbound) / sent_at / replied_at / notes

---

### support_tickets

**status**（L92–93）: `new` / `drafted` / `replied` / `escalated` / `closed`

**category**（L90）: `A_tech` / `B_sales` / `C_cancel` / `D_partnership` / `E_spam`

---

### seo_articles

**status**（L59–60）: `draft` / `published` / `archived`

その他: slug(unique) / title / target_keyword / draft_content / published_at / serp_position / organic_clicks_30d

---

### finance_snapshots

ステータス値なし。日次スナップショット（date UNIQUE）。

主要カラム: mrr / arr / active_pro / active_team / trialing / churned_today / refunded_today / api_cost_anthropic / api_cost_resend / total_cost_today / gross_margin / phase(0–3)

---

### legal_watch_diffs

**impact_level**（L147）: `High` / `Medium` / `Low`

監視URL（legal-watch/route.ts内にハードコード）:
- `https://www.nar.realtor/policy-and-legal/idx-policy`
- `https://www.nar.realtor/about/policies/cooperation-policy`
- `https://www.reso.org/standards`
- `https://www.ftc.gov/business-guidance/blog`

---

## RLS ポリシー（全テーブル共通）

```sql
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON [table]
  FOR ALL USING (auth.role() = 'service_role');
```

- `authenticated` / `anon` ロールからの直接アクセス不可
- フロントエンドからは読み書きできない設計

---

## 現状の cron ルート実装状況

すべてのルートが同パターン：

```ts
// skeleton — full implementation coming Week 1 post-launch
const { error } = await supabase.from('[table]').select('id').limit(1)
return NextResponse.json({ ok: !error })
```

**INSERT/UPDATE/DELETE は現時点で存在しない。**

---

## Assumptions & Gaps

- `revival_mail` というステータス値が `agents/sales.md` §6 L67 で言及されているが、マイグレーションの comment には含まれていない。コードに実装される際に追加が必要か要確認。
- `support_tickets` に対応する cron ルートは `src/app/api/cron/` 配下に存在しない。daily-brief または別途作成予定か不明。
- ステータス値は `text` 型で CHECK 制約なし。アプリケーション側でのバリデーション必須。
- `finance_snapshots` には `updated_at` トリガーがない（`created_at` のみ）。不変スナップショット設計と思われる。

---

## Implications

- Week 1 実装時に `sales-dm-draft` / `finance-snapshot` / `seo-draft` / `legal-watch` 各ルートへの本実装が必要
- `support_tickets` は cron ルート自体が未作成 — support メール受信フロー（Resend Inbound or webhook）も含めて設計が必要
- status値に CHECK 制約がないため、typo による不正値挿入リスクあり — 実装時に Zod バリデーションを追加推奨
