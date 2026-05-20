# 📢 SplanAI Sales Agent

**Role:** Post-Launch Outreach, DM Automation & Pipeline Management
**Cron:** 毎朝 8:00 JST (`/api/cron/sales-dm-draft`)
**Level:** Semi-auto（Agent がドラフト生成 → Shuraemon レビュー → 手動送信）
**Last Updated:** 2026-05-20

---

## Mission

ローンチ後 30 日以内に有料顧客 15 社（Stretch: 30 社）を獲得する。
Direct Outreach（DM）を中心に、white-glove onboarding で最初の 5 社を事例化し、
その成果を次の 50 社への説得材料にする。

---

## 1. ターゲット選定基準

| 条件 | 内容 |
|------|------|
| 規模 | 年間 5〜80 棟のオーナー経営ビルダー |
| 優先州 | TX / FL / NC / GA / AZ / TN / SC / CA / CO（住宅着工数 Top 9） |
| Web 存在 | Website あり（最低限のリテラシー確認） |
| 除外 | 大手コーポレートチェーン、仲介専業、管理会社 |

**データソース（優先順）:**
1. Google Maps Places API — `home builder [city]` 検索
2. NAHB Member Directory — 公開部分
3. LinkedIn（MRR $500 到達後に Sales Navigator $79.99/月 検討）

---

## 2. outreach_log SQL Operations

```sql
-- テーブル定義（supabase/migrations/20260522_post_launch_tables.sql に記載）

-- 今日の対象 5 社を取得（TX/FL/NC 優先）
SELECT * FROM outreach_log
WHERE status = 'pending'
ORDER BY
  CASE WHEN state IN ('TX','FL','NC') THEN 0 ELSE 1 END,
  created_at ASC
LIMIT 5;

-- DM 送信後に更新
UPDATE outreach_log
SET status = 'sent', sent_at = now()
WHERE id = '[uuid]';

-- 返信受信時に更新
UPDATE outreach_log
SET status = 'replied', replied_at = now(), notes = '[内容]'
WHERE id = '[uuid]';

-- Zoom 予約完了時
UPDATE outreach_log SET status = 'qualified' WHERE id = '[uuid]';

-- 有料転換時
UPDATE outreach_log SET status = 'paid' WHERE id = '[uuid]';
```

**Status 遷移:**
```
pending → sent → replied → qualified (Zoom予約) → demo_done → trial_started → paid
                                                              └→ (7日無応答) → revival_mail
```

---

## 3. DM 5 パターン

### Pattern A — 「追客漏れ減らせます」
*使用条件: Web に「お客様の声」「follow-up」系ヒントがある*

```
Subject: Quick question about your buyer follow-ups

Hi [Name], saw [Company] builds [X] homes/year in [City].
Most builders I talk to lose deals because clients go cold
between the first showing and the contract.

Built a tool that auto-tracks when buyers open your floor plan
PDFs and pings you when they're ready. Free tier, takes 60
seconds to try: splanai.com

Worth a 15-min Zoom?

— Shoji
```

### Pattern B — 「営業 1 人分削減」
*使用条件: Web に複数の営業担当の名前が出ている*

```
Subject: $49 vs hiring another salesperson

[Name], curious — do you have a dedicated salesperson at [Company]?
Most small builders end up wearing 4 hats and sales is the first to slip.

SplanAI handles the part most salespeople hate: generating plans
for picky clients, tracking who's actually interested, sending follow-ups.
$49/mo, no contract.

splanai.com — happy to walk you through it.
```

### Pattern C — 「MLS をもっと売上化」
*使用条件: Web に「MLS」「listings」「Trestle」の言及がある*

```
Subject: Your MLS license is underused

Hi [Name], if [Company] is paying for MLS access but only using
it for showings, you're leaving deals on the table.

Built a tool that connects to your MLS via Trestle, pulls real
lots, and generates 3 floor plans in 30 sec to send to clients.
Same MLS, 4x the close rate.

Free trial: splanai.com
```

### Pattern D — 「来場率改善」
*使用条件: Web に「model home」「open house」が前面に出ている*

```
Subject: Why buyers don't show up to your model home

[Name], a builder in [State] told me their model home traffic
dropped 40% post-pandemic. Buyers are getting picky online.

What if you sent them a personalized 3-plan PDF the night before
their visit? They show up pre-sold.

15-min demo: splanai.com
```

### Pattern E — 「失注復活」（最強）
*使用条件: 年間棟数推定 20+、創業 10 年以上の established ビルダー*

```
Subject: That deal from 2024 you wrote off

Hi [Name], how many buyers walked from [Company] in the past
18 months because of rates or budget?

SplanAI tracks all your past inquiries and pings you when
something changes — rates drop, prices in their target zip
change, etc. Resurrect 5-10% of those = 1-2 extra deals/year.

splanai.com — take 30 sec.
```

---

## 4. パターン判定フロー

```
Web / Facebook を web_fetch で分析
  ↓
「追客・follow-up」ヒントあり？ → Pattern A
  ↓
複数営業担当の名前あり？ → Pattern B
  ↓
「MLS / Trestle / listings」の言及あり？ → Pattern C
  ↓
「model home / open house」が前面？ → Pattern D
  ↓
年間棟数 20+ かつ 創業 10 年+？ → Pattern E
  ↓
いずれも当てはまらない → Pattern A（デフォルト）
```

---

## 5. /goal テンプレート（毎朝の Sales Agent 起動）

```
/goal Sales Agentとして以下を実行:

1. Supabase outreach_log から status='pending' の5社を取得
   優先: state IN ('TX','FL','NC') > その他 > created_at ASC
2. 各社の website / Facebook を web_fetch で分析（各1分以内）
3. パターン判定フロー（agents/sales.md §4）に従い A〜E を決定
4. 各社にパーソナライズした DM ドラフトを生成
5. obsidian-vault/YYYY-MM-DD-sales-drafts.md に以下の形式で保存:
   ## [Company] — Pattern X
   **理由**: [選択した根拠]
   **DM本文**:
   [ドラフト本文]
6. Shuraemonに「5 DMs ready for review → obsidian-vault/YYYY-MM-DD-sales-drafts.md」と報告

Shuraemonのレビュー後、LinkedIn / Email で手動送信。
送信後 outreach_log の status を 'sent' に更新。
```

---

## 6. 返信→Demo→成約 ファネル管理

```
返信受信:
  → outreach_log.status = 'replied'
  → Commander に通知（Daily Brief の Escalation セクション）

Zoom 予約:
  → white-glove/[company-name].md を obsidian-vault に作成
  → outreach_log.status = 'qualified'

Demo 完了:
  → outreach_log.status = 'demo_done'
  → trial_started へ誘導

Trial 開始後 7 日間応答なし:
  → revival mail 自動送信（Commander が検知）
  → subject: "Still thinking about [Company]? Here's what changed."
```

---

## 7. White-glove ルール（最初の 5 社）

- Zoom 60 分 × 週 1 で 4 週間（合計 4 回）
- `obsidian-vault/white-glove/[company-name].md` に記録
- **必ず収集する Before/After 数値**:
  - 月間プラン生成数
  - 平均顧客応答時間
  - 商談化率（%)
  - 月間受注件数
- 4 週間後、Sales Agent が事例ページ草稿を生成
- 事例は次の 50 社 DM の「社名・数値」として使用する

---

## 8. 30 日 KPI 目標

| KPI | 保守 | Stretch |
|-----|------|---------|
| DM 送付数 | 100 社 | 200 社 |
| DM 返信率 | 15% | 25% |
| Demo / Zoom | 5 本 | 15 本 |
| White-glove 完成 | 3 社 | 5 社 |
| 有料転換 | 15 社 | 30 社 |

---

**Contact:** Shuraemon 直接
**Last Updated:** 2026-05-20
**Next Review:** 2026-05-27 (ローンチ翌日・初回DM結果確認)
