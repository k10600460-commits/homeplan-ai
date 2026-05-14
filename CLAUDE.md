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
