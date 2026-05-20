# HomePlanAI — プロジェクト引き継ぎメモ

## プロダクト概要
- **名前**: HomePlanAI
- **URL（本番）**: https://homeplan-ai.vercel.app
- **ターゲット**: アメリカの中小ホームビルダー（年間10〜50棟）
- **コアバリュー**: 土地条件を入力 → AIが30秒で3プラン生成・PDF出力
- **差別化**: 設計ツールではなく「営業ツール」として特化
- **キャッチコピー**: "Close more deals. Show clients their dream home before they sign."

## 料金プラン（確定）
| プラン | 価格 | 内容 |
|--------|------|------|
| Free | $0 | 3回まで無料・PDF出力あり |
| Pro | $49/月 | 14日無料トライアル → 無制限・ロゴ入りPDF・優先サポート |

## 技術スタック
- **フロントエンド**: Next.js (App Router) + TypeScript + Tailwind CSS
- **バックエンド**: Supabase (Auth + DB)
- **AI**: Anthropic Claude API
- **決済**: Stripe（本番有効化済み）
- **デプロイ**: Vercel

## 完了済みステップ
- [x] Step 1: Next.jsプロジェクト作成・LP・AI生成API・PDF出力
- [x] Step 2: Supabase Auth・DBセットアップ（subscriptions・api_usageテーブル・RLS）
- [x] Step 3: APIコスト上限（Free: 3回・Pro: 100回/月）・アップグレード導線
- [x] Step 4: ロゴ入りPDF出力（透明背景PNG・PLAN 1〜3バッジ）
- [x] Step 5: Stripe Webhook本番登録（エンドポイント: /api/stripe/webhook）
- [x] Step 6: Vercelデプロイ・環境変数設定・Stripe本番有効化
- [x] Step 7: LP仕上げ（SEO meta・OGP・料金セクション・お客様の声）

## 次のステップ
- [ ] Step 8: 本番テスト・最終確認（E2Eフロー・Stripe本番決済・PDF・上限制御）
- [ ] Step 9: ProductHunt / SNS 告知準備（Launch文・スクショ・デモGIF）

## ローンチ予定日
**2026年5月26日（火）PST 0:00 — ProductHunt**

## 重要ファイル構成
```
src/
  app/
    page.tsx          ← LP（このファイル）
    layout.tsx        ← SEO metadataはここにも追加推奨
    api/
      generate/       ← AI生成API
      stripe/         ← Stripe Webhook・checkout・portal
      usage/          ← 使用量API
    dashboard/        ← ユーザーダッシュボード
    login/            ← ログイン
    results/          ← 生成結果表示
    upgrade/          ← アップグレード導線
```

## 環境変数（Vercel設定済み）
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID
- NEXT_PUBLIC_APP_URL

## 注意事項
- `.env.local` はGitに含めない（.gitignore確認済み）
- Stripe本番環境は有効化済み（銀行口座・身分証・セキュリティ申告完了）
- フッターの年は2026に修正済み

（## 2026年5月14日 戦略セッション追記

### ランディPROとの比較・再評価

- 機能数ベース：約20〜25%

- ビジネスモデル本質ベース：約10%以下

- 理由：ランディPROは「顧客がビルダーのエコシステムに留まり続ける仕組み」

  HomePlanAIは現状「1回使って終わるツール」に近い

### ランディPROの本質（3層構造）

- Layer 1：土地情報の集約（インフラ）

- Layer 2：顧客の自走化（エンゲージメント）

- Layer 3：ビルダーの監視＋自動追客（CRM）

### 追加タスクリスト

#### ローンチ前（今週末）

- [ ] 顧客共有リンク＋閲覧通知

      ビルダーがリンクを顧客に送る→顧客がプランを見るたびビルダーに通知

- [ ] 返済シミュレーション（簡易）

      ローン金額・金利・期間→月額返済額を計算

- [ ] Zillowリンク連携

      生成プランのエリアをZillowで�      生成プラン��自�      生成プランのエリアをZillowで�   （ローンチ後）

- [ ] MLSライセンス紐づけ機能

      ビルダー�      ビルダー�      ビルダー�      ビルPlanAIがそのIDでAPIコール

      生成プランに実際の土地情報を表示

- [ ] RentCast API連携（市場価格データ表示）

#### Month 3〜（スケール�#### Month 3〜（スケール�#### Month 
      「この土地（実在）にこのプランが建てられます」という提案

      ランディPROのアメリカ版を完全再現

### 差別化ポジショニ### 差別化ポジシ�）

���������������������������������������������������������������������������トフォーム」

### Google Maps / Places API コスト

- 月$200無料枠あり

- 初期（〜50社）�- 初期（〜50社）�- 初期（〜50社）�

-------------------------------------------------------------------��と）


## Post-Launch Operations (5/27以降)

ローンチ後の運営は `obsidian-vault/master-todo-post-launch.md` に従う。

### 自動化原則
- **Auto**: Cron + Claude APIで完結 (Daily Brief / SEO draft / MRR snapshot)
- **Semi**: エージェントドラフト→Shuraemonレビュー→送信 (DM / SEO公開 / サポート)
- **Manual**: 人間対応必須 (white-glove / 戦略決定)

### Shuraemon時間配分目標
営業40% / 戦略30% / 改善20% / 雑務10%

### エージェント原則
1. すべての出力は Foam に記録 (`obsidian-vault/YYYY-MM-DD-agent-name.md`)
2. エージェント間通信は Commander 経由
3. 失敗は再試行ではなく escalation (3回失敗で Shuraemon に通知)
4. コストは Finance Agent が追跡・閾値超過で自動停止

### Phase判定 (Finance Agent が自動判定)
- **Phase 0**: MRR < $500 (追加投資ゼロ)
- **Phase 1**: $500–$2,500 (+$65/月: Vercel Pro + Supabase Pro + Resend Pro)
- **Phase 2**: $2,500–$10,000 (+$446/月: Claude Max + Cloudflare Pro + Sentry)
- **Phase 3**: $10,000+ (+$1,500/月: 保険・SOC2等)

### Cron スケジュール (post-launch)
| Job | Schedule (JST) | 説明 |
|-----|---------------|------|
| `/api/cron/finance-snapshot` | 毎朝 6:00 | MRR/コスト日次記録 |
| `/api/cron/daily-brief` | 毎朝 7:00 | Commander 統括メール |
| `/api/cron/sales-dm-draft` | 毎朝 8:00 | DM 5本ドラフト生成 |
| `/api/cron/seo-draft` | 月・木 14:00 | SEO 記事ドラフト |
| `/api/cron/legal-watch` | 毎週月 9:00 | NAR/MLS/FTC クロール |

---

## /goal コマンド

`/goal [目標]` と入力されたら以下を自動実行する：

1. **分解** - 目標をサブタスクに分解してリスト化
2. **実行** - 各タスクを順番に自律実行
3. **検証** - 各タスク完了後に動作確認
4. **記録** - 完了内容をFoam（~/obsidian-vault）にメモ保存
5. **完了報告** - 全タスク完了後に結果をサマリー表示

### ルール
- 不明点があっても止まらず、最善策で進める
- エラーが出たら自己修正して続行
- 完了まで人間に確認を求めない
