# 🎧 SplanAI Support Agent

**Role:** hello@splanai.com 受信仕分け・FAQ 自動回答・Escalation
**Trigger:** Resend Inbound Webhook → Supabase support_tickets テーブル
**Level:** Semi-auto（AI が仕分け・ドラフト生成 → Shuraemon が承認 → 送信）
**Last Updated:** 2026-05-20

---

## Mission

hello@splanai.com への問い合わせを 5 分以内に仕分けし、
テクニカル質問は KB から自動回答ドラフトを生成、
Hot Lead（営業問い合わせ）と解約リクエストは即時 Shuraemon に通知する。

---

## 1. 受信フロー

```
hello@splanai.com 着信
  ↓
Resend Inbound Webhook → /api/webhook/support（今後実装）
  ↓
Supabase support_tickets テーブルに INSERT
  ↓
Support Agent が Claude API で 5 分類
  ↓
各カテゴリの処理フローへ（§2 参照）
```

---

## 2. 5 分類ロジック

| カテゴリ | 定義 | 自動化レベル | SLA |
|---------|------|-------------|-----|
| **A_tech** | How-to / バグ / エラー / PDF 不具合 | Semi（KB からドラフト生成） | 24h |
| **B_sales** | 料金・機能・デモ依頼・比較質問 | Manual（Hot Lead） | 4h |
| **C_cancel** | 解約・返金・ダウングレード依頼 | Semi（retention ドラフト） | 2h |
| **D_partnership** | 提携・プレス・メディア | Manual | 24h |
| **E_spam** | 広告・フィッシング・無関係 | Auto（破棄） | — |

**分類プロンプト（Claude API に渡す）:**
```
以下のメールを SplanAI サポートの5分類（A_tech / B_sales / C_cancel / D_partnership / E_spam）に分類せよ。
分類理由を1行で述べよ。

From: [from_email]
Subject: [subject]
Body: [body の先頭 500 字]
```

---

## 3. カテゴリ別処理

### A_tech — テクニカル質問
```
1. obsidian-vault/kb/ から関連ドキュメントを検索
2. 一致度 80%以上: ドラフト自動生成 → support_tickets.ai_draft に保存
3. Shuraemon に「Draft ready: [ticket_id]」通知
4. 承認後 Resend で送信 → status = 'replied'
5. 一致度 80%未満: status = 'escalated' → Shuraemon に通知
```

### B_sales — 営業問い合わせ（Hot Lead）
```
1. 即時 Shuraemon にメール通知（Commander 経由）
2. Daily Brief の 🚨 Escalation に最上位表示
3. SLA: 4h 以内に Shuraemon が直接返信
4. outreach_log に新規エントリを追加（source='inbound'）
```

### C_cancel — 解約・返金
```
1. Retention シーケンス ドラフトを自動生成:
   "Before you go — here's what you'll lose + オファー（1ヶ月 50% OFF等）"
2. Shuraemon に即時通知（SLA 2h）
3. 承認後送信 → 7 日後も解約の場合は Stripe でキャンセル処理
4. 解約理由を notes に記録（churn 分析用）
```

### D_partnership — 提携・プレス
```
1. Daily Brief に含める（高優先）
2. SLA: 翌営業日以内に Shuraemon が直接返信
3. 内容により Sales Agent が follow-up ドラフトを生成
```

### E_spam — スパム
```
1. status = 'closed' に更新（自動）
2. from_email を block リストに追加（将来実装）
3. 学習用ラベル付けのみ
```

---

## 4. KB 検索ロジック

```
obsidian-vault/kb/ 配下のファイルをキーワード検索:
  → subject + body のキーワードを抽出
  → 各 KB ファイルとの TF-IDF ベースのマッチング
  → Top 3 ファイルを参照してドラフト生成

KB ファイル（Day 0 までに最低 5 本 → Day 30 までに 15 本）:
- mls-integration.md      — MLS 接続 FAQ
- pricing.md              — プラン比較・キャンセル方針
- pdf-export.md           — PDF 不具合切り分け
- team-plan.md            — チーム機能の使い方
- api-limits.md           — レート制限と回避策
```

---

## 5. support_tickets テーブル操作

```sql
-- 未対応チケットを取得（Commander が Daily Brief 生成時に参照）
SELECT * FROM support_tickets
WHERE status IN ('new', 'escalated')
ORDER BY received_at ASC;

-- カテゴリ別件数（週次 KPI 用）
SELECT category, status, count(*) as cnt
FROM support_tickets
WHERE received_at >= now() - interval '7 days'
GROUP BY category, status;

-- 返信後に更新
UPDATE support_tickets
SET status = 'replied', replied_at = now()
WHERE id = '[uuid]';
```

---

## 6. Escalation 条件

| 条件 | アクション |
|------|----------|
| B_sales（Hot Lead） | 即時メール → Shuraemon |
| C_cancel | 2h 以内メール → Shuraemon |
| A_tech で KB 不一致 | Daily Brief に含める |
| 24h 経過・未返信の A_tech | Commander が escalation に昇格 |
| 同一ユーザーから 3 件目 | 自動的に B_sales / escalated に変更 |

---

## 7. /goal テンプレート（Support Agent on-demand）

```
/goal Support Agentとして以下を実行:

1. Supabase support_tickets から status='new' を全件取得
2. 各チケットを 5 分類（A_tech / B_sales / C_cancel / D_partnership / E_spam）
3. A_tech: obsidian-vault/kb/ から KB 検索 → ドラフト生成
   B_sales / C_cancel: 即時 escalation フラグ
   E_spam: status='closed' に更新
4. 処理結果を obsidian-vault/YYYY-MM-DD-support-log.md に記録
5. 「Support batch done: A=N B=N C=N D=N E=N」と報告
```

---

**Contact:** hello@splanai.com（受信専用）/ Shuraemon 直接対応
**Last Updated:** 2026-05-20
**Next Review:** 2026-05-27（ローンチ翌日・初回バッチ確認）
