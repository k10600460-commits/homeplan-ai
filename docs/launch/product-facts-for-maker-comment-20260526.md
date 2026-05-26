# SplanAI — Maker's Comment 用プロダクト事実整理

**作成日**: 2026-05-26  
**目的**: PH Maker's Comment 起草・OI-013 対応のための、コードで確認できる事実の一覧。  
**方針**: 推測・期待値ではなく、実装コードが裏付ける事実のみ記載。未確認事項は明示する。

---

## 1. OI-013 の特定

| 項目 | 内容 |
|------|------|
| タイトル | splanai@gmail.com 作成 |
| 内容 | 管理用 Gmail アカウントの作成 |
| 優先度 | 🟡 ローンチ前推奨（必須ではない） |
| ステータス | **未着手** |
| 関連ファイル | なし（コードに影響しない手動タスク） |
| ブロッカー | なし |

**判断**: Maker's Comment の起草に OI-013 は影響しない。独立した手動タスクとして扱う。

---

## 2. ローンチ時点で実在・動作する機能

### A. AI 間取り生成（コア機能）

**実装状況**: 完全実装・本番動作確認済み  
**ファイル**: `src/app/api/generate/route.ts`

- 入力: ロットサイズ(sq ft)・予算(USD)・家族人数（必須） + 都市・州（任意）
- 処理: `claude-sonnet-4-6` モデルを 1 回呼び出し
- 出力: 3 つの異なる建築スタイルの間取りプラン（JSON）
  - 各プラン: 名前・スタイル・面積・寝室数・バスルーム数・階数・推定コスト・説明・部屋リスト・ハイライト
- システムプロンプト: プロンプトキャッシュ（`cache_control: ephemeral`）あり、コスト最適化済み
- セキュリティ: IP ベースレートリミット(5 req/min)・入力バリデーション実装済み
- 使用制限:
  - Free: 3 回/月
  - Pro: 100 回/月
  - Team: 9999 回/月（事実上無制限・ユーザー向け表示は "Unlimited"）

**言ってよいこと**: "AI generates 3 floor plans in 30 seconds" ✅（実測済み）

---

### B. 近隣データ取得（Neighborhood Intelligence）

**実装状況**: 完全実装・動作確認済み  
**ファイル**: `src/app/api/neighborhood/route.ts`

- 都市・州を入力するとトリガー（任意）
- **Google Maps API** で取得するデータ:
  - 近隣の学校（名前・評価・距離）
  - 近隣の病院
  - 近隣のスーパー・食料品店
  - 警察署・消防署の数（Safety Score 計算に使用）
  - Safety Score（1〜10点・High/Moderate/Low ラベル付き）
- **RentCast API** で取得するデータ:
  - 平均家賃・中央家賃（averageRent / medianRent）
  - 平均物件価格・中央物件価格（averageSalePrice / medianSalePrice）
- **注記**: 都市・州入力が必要。番地入力は "coming soon"（コード上 placeholder のみ、データ取得未実装）

**言ってよいこと**: "neighborhood data — schools, safety score, average rent, and market prices" ✅

---

### C. ローン計算機（Mortgage Calculator）

**実装状況**: 完全実装  
**ファイル**: `src/app/results/page.tsx`（クライアントサイド計算）

- 各プランの推定コストをベースに計算
- パラメータ: 頭金%(3〜50)・金利%(3〜12)・返済期間(15/30年)
- 出力: 月次返済額・元本・総利息・総支払額・頭金額
- サーバー不要・外部 API 不要の純粋フロントエンド実装

**言ってよいこと**: "interactive mortgage calculator with adjustable down payment, rate, and term" ✅

---

### D. クライアント向け共有ポータル（`/s/[slug]`）

**実装状況**: 完全実装・本番動作確認済み  
**ファイル**: `src/app/s/[slug]/page.tsx`、`src/app/api/share/create/route.ts`

- 間取り生成後、ユニークな URL（例: `splanai.com/s/abc12345`）を生成
- URL はランダム 8 文字スラッグ（衝突リトライ 5 回）
- 有効期限設定・無効化（`is_active` フラグ）対応
- `SharePortalClient` でクライアント向け表示（ブランド表示あり）

---

### E. リアルタイムビュー通知（Real-Time Client Tracking）

**実装状況**: 完全実装  
**ファイル**: `src/app/api/share/event/route.ts`、`src/app/dashboard/DashboardClient.tsx`

- クライアントがリンクを開く → `link_events` テーブルに INSERT
- ダッシュボードが Supabase Realtime でリッスン → ビルダーにリアルタイム通知表示
- 追跡イベント: `view`・`pdf_download`・`plan_selected`
- プライバシー: IP は SHA-256 ハッシュで保存（生 IP 保存なし）
- RLS: 自分のリンクへのイベントのみ受信

**言ってよいこと**: "real-time notification when your client opens the link" ✅

---

### F. PDF エクスポート

**実装状況**: 完全実装（2 パターン）  
**ファイル**: `src/app/results/page.tsx`（jsPDF）、`src/app/api/generate-pdf/route.ts`（pdfmake）

**パターン 1 — 標準 PDF（Free/Pro）**:
- jsPDF でクライアントサイド生成
- ヘッダーに SplanAI ロゴ（`/logo.png`）
- 各プラン 1 ページ・部屋リスト・コスト・スタイル情報含む

**パターン 2 — White-Label PDF（Team のみ）**:
- Team ユーザーは `company_name`（`team_profiles` テーブル）を自動取得
- White-label 有効時: SplanAI ブランドを除去し、会社名で置換
- PDF ファイル名も会社名ベースに変更

**注意**: LP は "Branded PDF with your logo"（Pro 機能）と記載しているが、コード上 Pro の PDF ヘッダーは SplanAI ロゴのみ。Pro ユーザーが自社ロゴを upload して PDF に入れる機能は**未実装**。白ラベル（SplanAI ブランド除去 + 会社名置換）は Team のみ実装済み。

**言ってよいこと**（正確な表現）:
- Free: "SplanAI branded PDF" ✅
- Pro: "Professional PDF proposal" ✅（ただし "your logo" は誤り — SplanAI ロゴのみ）
- Team: "White-label PDF — your company name, no SplanAI branding" ✅

---

### G. MLS 連携（Trestle API）

**実装状況**: 実装済み・ただし要ユーザー設定  
**ファイル**: `src/app/api/mls/connect/route.ts`、`src/app/api/mls/lot-data/route.ts`

- Pro/Team プランのみアクセス可能（Free は 403 ゲート）
- ユーザーが Trestle の `client_id` / `client_secret` をダッシュボードで入力
- 資格情報は暗号化して DB 保存（`encrypt()` / `decrypt()`）
- 取得フィールド: ListingId・住所・LotSizeArea・Zoning・ListPrice・StandardStatus・PropertyType
- トークンリフレッシュ自動化済み

**注意**: Trestle アカウント（MLS ライセンス）はユーザーが自分で保有・設定する必要がある。SplanAI が MLS データを自前で提供するわけではない。

**言ってよいこと**: "connect your MLS license (via Trestle) to pull real lot data into your floor plans" ✅

---

### H. Team 管理機能

**実装状況**: 完全実装  
**ファイル**: `src/app/api/team/` 配下

- Team オーナーがメンバーをメールで招待（`/api/team/invite`）
- 招待メール送信（Resend 経由）
- メンバーが招待リンクから参加（`/api/team/accept-invite`）
- メンバー一覧取得・今月のプラン生成数表示（KPI）
- メンバー削除
- 上限: 5〜15 名（LP 記載）
- Team profile（会社名）保存 (`/api/team/profile`)

---

### I. Stripe サブスクリプション管理

**実装状況**: 完全実装・本番動作確認済み**  
**ファイル**: `src/app/api/stripe/` 配下

- Pro / Team それぞれ Checkout → 14 日無料トライアル → 自動課金
- Webhook で Supabase に同期（status: trialing/active/past_due/canceled）
- Stripe Customer Portal（解約・カード変更）
- Trial Reminder メール（3 日前・cron）
- Cancel at period end 対応（ダッシュボード表示済み）

---

### J. メール自動化

**実装状況**: 完全実装  
**ファイル**: `src/lib/emails.ts`

| メール | トリガー | 状態 |
|--------|----------|------|
| Welcome | サインアップ確認後 | ✅ 実装・本番確認済み |
| First Plan Follow-up | 初回生成後 | ✅ 実装済み |
| Trial Reminder | トライアル終了 3 日前（cron） | ✅ 実装済み |
| Cancellation | 解約時（webhook） | ✅ 実装済み |
| Team Invite | メンバー招待時 | ✅ 実装済み |

---

### K. Auth・セキュリティ

**実装状況**: 完全実装・本番確認済み**

- Email/Password + Magic Link（Supabase Auth）
- PKCE フロー → token_hash 方式（クロスブラウザ確認問題修正済み）
- パスワードリセット
- RLS（Row Level Security）全テーブル適用
- IP ベースレートリミット（複数エンドポイント）

---

## 3. 未完成・post-launch の機能

| 機能 | 状態 | 根拠 |
|------|------|------|
| 番地入力 → ロットサイズ・ゾーニングデータ取得 | **未実装**（"coming soon" 表示） | `page.tsx:34` の streetHint |
| MLS カバレッジマップ | **未実装**（"full coverage map coming soon"） | LP FAQ |
| `/s/[slug]` 固有 OGP（顧客名入り） | **未実装** | generateMetadata 未追加 |
| Pro ユーザーの自社ロゴ PDF 入れ込み | **未実装** | generate-pdf に logo upload なし |
| Post-launch cron（finance-snapshot / daily-brief / sales-dm / seo-draft / legal-watch） | **実装済みだが未稼働**（Vercel cron 設定待ち） | `api/cron/` 配下に route.ts 存在 |
| Zillow 連携 | **未実装** | コードに存在しない |
| `plan_generations` テーブルへの INSERT | **未実装**（OI-007） | `/api/generate` に INSERT なし |

---

## 4. LP が実際に主張していること（英語）

以下は `src/app/page.tsx` の EN テキストからの抜粋（事実確認付き）:

| LP の主張 | 事実確認 |
|-----------|---------|
| "AI generates 3 floor plans in 30 seconds" | ✅ 正確（Claude API 1 回、本番確認済み） |
| "Share instantly. Close faster." | ✅ 共有リンク生成・クライアントポータル実装済み |
| "Know exactly when they open it, and which plan they love." | ✅ Realtime view tracking 実装済み |
| "Auto-fetch nearby schools, safety data, and market rents via Google Maps and RentCast" | ✅ 正確 |
| "Branded PDF in One Click" | ⚠️ Free/Pro は SplanAI ブランド PDF。Pro で「自社ロゴ入り PDF」は**未実装**。Team のみ white-label |
| "MLS lot data connection via Trestle" | ✅ 実装済み（要ユーザー MLS 資格情報） |
| "mortgage estimates built in" | ✅ 計算機実装済み（フロントエンド） |
| "Get notified when they view it" | ✅ Realtime 通知実装済み |
| "5–15 team members" | ✅ team_members テーブル・招待フロー実装済み |
| "Team dashboard & member KPIs" | ✅ 今月のプラン生成数が KPI として表示 |

---

## 5. Maker's Comment で「言ってよいこと / 言ってはいけないこと」

### ✅ 事実として言ってよいこと

- **間取り生成の速度**: "AI generates 3 complete floor plans in under 30 seconds"
- **AI モデル**: Claude（Anthropic）使用（具体的モデル名は開示任意）
- **ターゲット**: US home builders — small to mid-size (10–50 homes/year)
- **コアバリュー**: "sales tool, not a design tool"
- **近隣データ**: Schools, hospitals, safety score, average market rent & sale prices (powered by Google Maps + RentCast)
- **共有リンク + リアルタイム通知**: "Know when your client opens the plan"
- **モーゲージ計算機**: "interactive mortgage calculator built into every plan"
- **Free で即試せる**: "3 free plans — no credit card required"
- **14 日間無料トライアル**: Pro / Team 両方
- **MLS 連携**: "Pro/Team users can connect their MLS license for real listing data" (Trestle)
- **Team white-label PDF**: "Team plan removes all SplanAI branding from PDFs"
- **二言語 LP**: EN + ES 対応（LP コードで確認）

### ❌ 言ってはいけないこと（未実装・誤解を招く表現）

| 避けるべき表現 | 理由 |
|--------------|------|
| "Add your own logo to the PDF" | Pro でのロゴ upload 機能は未実装 |
| "Street address → zoning data" | 番地入力の near-data 取得は "coming soon" のみ |
| "MLS coverage map" | 未実装（FAQ で "coming soon" と言及） |
| "Real MLS listing in your proposal" | ユーザーが Trestle 資格情報を持っている場合のみ動作 |
| "Actual floor plan drawings / blueprints" | 生成されるのはテキストベースの仕様書・部屋リスト（図面ではない） |
| 具体的ユーザー数・MRR（実数値） | ローンチ前のため存在しない |

---

## 6. 推奨 Maker's Comment フレーム（事実ベース）

```
We're SplanAI — an AI-powered sales tool built for US home builders.

The problem: builders spend hours on proposals, only to lose clients to faster competitors.
The solution: enter a lot size, budget, and family size → get 3 complete floor plans in 30 seconds.

What we built:
• AI floor plan generation (Claude, 3 plans per session)
• Neighborhood intelligence — schools, safety score, market rents & sale prices
• Interactive mortgage calculator on every plan
• Shareable client portal + real-time "client viewed" notifications
• MLS lot data integration (Pro/Team) via Trestle
• White-label PDF for Team plans
• 5–15 seat Team plan for building companies

Pricing: Free (3 plans/mo) → Pro $49/mo → Team $149/mo.
14-day free trial on all paid plans. No credit card to start.

Happy to answer questions from fellow builders or PH community!
```

---

## 7. 参照ファイル

| ファイル | 確認した内容 |
|---------|------------|
| `src/app/api/generate/route.ts` | AI 生成フロー・モデル・使用制限 |
| `src/app/api/neighborhood/route.ts` | Google Maps + RentCast 取得項目 |
| `src/app/api/share/create/route.ts` | 共有リンク生成 |
| `src/app/api/share/event/route.ts` | ビュー追跡イベント |
| `src/app/api/mls/connect/route.ts` | MLS 資格情報保存 |
| `src/app/api/mls/lot-data/route.ts` | MLS データ取得フィールド |
| `src/app/api/team/members/route.ts` | Team メンバー管理・KPI |
| `src/app/api/team/profile/route.ts` | 会社名（white-label 用） |
| `src/app/results/page.tsx` | モーゲージ計算機・PDF 生成・白ラベル判定 |
| `src/app/s/[slug]/page.tsx` | クライアント共有ポータル |
| `src/app/dashboard/DashboardClient.tsx` | Realtime 通知・サブスクリプション管理 |
| `src/app/page.tsx` | LP の実際の主張テキスト |
| `src/lib/emails.ts` | 自動メール一覧 |
| `src/components/SocialProofBar.tsx` | 現在 "Launching May 26" 表示（未変更） |
