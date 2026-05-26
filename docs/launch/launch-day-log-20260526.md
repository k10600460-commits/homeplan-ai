# SplanAI ローンチ当日ログ — 2026-05-26

**作成日**: 2026-05-26  
**作成方法**: git コミット履歴・docs/launch/ 当日作成ファイルと突き合わせ、チャット側サマリーの誤記を修正して統合。

---

## 1. git コミット一覧（本日 / JST 時刻順）

| 時刻(JST) | ハッシュ | 種別 | 内容 |
|-----------|---------|------|------|
| 09:48 | `bd69386` | fix(emails) | reply-to: hello@splanai.com を全5通のトランザクションメールに追加 |
| 11:37 | `4a84ca4` | fix(lp) | Hero CTA「Watch demo」→「See how it works」(EN/ES) |
| 11:56 | `f7488ee` | fix(lp) | `#generate` に scroll-mt-24 追加(スティッキーナビ隠れ防止) |
| 12:31 | `c2a652a` | fix(pdf) | テキストワードマーク・推定コスト注記・room disclaimer・サマリー行間修正 |
| 13:54 | `8737d6a` | fix(lp) | `#generate` の scroll-mt を 64px に調整(Trust Bar bleed 解消) |
| 14:11 | `402439e` | fix(pdf) | FEATURES 多行折り返し対応・room disclaimer の footer クランプ修正 |
| 14:30 | `be017f7` | fix(pdf) | room breakdown と features のページネーション(overflow 防止) |
| 14:47 | `e0ea742` | fix(pdf) | セクション間隔の圧縮(14部屋プランが1ページに収まるよう) |
| 15:02 | `7ab2553` | fix(pdf) | room row pitch を動的計算(1プラン=1ページ保証) |
| 15:16 | `622be22` | fix(pdf) | disclaimer 前の stale maybeNewPage(8) 呼び出しを除去 |
| 15:54 | `38b71fe` | feat(launch) | **PH バッジ LIVE 表示化**(ProductHuntBadge / SocialProofBar) |
| 17:03 | `4e5759d` | fix(seo) | **canonical を LP 専用化・sitemap から /login 除外**(M-2/M-3) |

**合計**: 本日 12 コミット / 全デプロイ済み（Vercel Production `splanai.com`）

---

## 2. プロダクト実装

### 2-1. Floor Plan PDF 品質修正（計6コミット: c2a652a〜622be22）

**問題**: room breakdown が多室プランで複数ページにオーバーフロー。disclaimer が孤立ページに出力されていた。

**修正内容（git 裏取り済み）**:
- `be017f7`: room breakdown・features・highlights の各行に `maybeNewPage()` 安全網を追加。ページ超過時にフッターを描画してから addPage する `drawFooter()` ヘルパー追加。
- `e0ea742`: セクション間 pad を全箇所で削減（form gap 7→5mm、stats 8→6mm 等）、room row pitch 9→8mm に圧縮。
- `7ab2553`: room row pitch を `(SAFE_BOTTOM - y - 6) / rowCount` で動的計算（[6, 8] mm にクランプ）。これにより全部屋数で 1 プラン = 1 ページが保証される。
- `622be22`: disclaimer 前の stale `maybeNewPage(8)` を除去（dynamic pitch が disclaimer 用余白を既に確保しているため不要だった orphan-page 誘発コードを削除）。

**結果**: 全プランで room breakdown 直後の同ページに disclaimer が収まることをコード上で保証。

### 2-2. メール reply-to 追加（bd69386）

- 対象: welcome / trial-reminder / trial-end / cancellation / team-invite の全5通
- 変更ファイル: `src/lib/emails.ts`（6行追加）
- 詳細: `docs/launch/reply-to-and-c01-fix-20260526.md`

### 2-3. LP Hero CTA 修正（4a84ca4 / f7488ee / 8737d6a）

- Hero セカンダリ CTA を「Watch demo」→「See how it works」に変更（英語/スペイン語）
- `#generate` セクションのスクロール位置調整(scroll-mt 96px → 64px)で Trust Bar が nav に隠れる問題を解消

### 2-4. ProductHunt バッジ LIVE 表示化（38b71fe）

変更前後（git 裏取り済み）:

| コンポーネント | 変更前 | 変更後 |
|---|---|---|
| `ProductHuntBadge` | state="pre-launch"・青バッジ・旧URL | state="launch-day"・オレンジ点滅バッジ |
| `SocialProofBar` | "Launching May 26 on ProductHunt"・リンクなし | "🚀 LIVE on ProductHunt — Upvote us today!"・PHリンク付き |
| 全 PH href | `producthunt.com/posts/splanai` | `producthunt.com/products/splanai?launch=splanai` |

- 詳細: `docs/launch/ph-badge-live-activation-20260526.md`

---

## 3. SEO 修正（4e5759d）

**M-2（canonical を LP 専用化）**:
- `src/app/layout.tsx:16` の `alternates: { canonical: "https://splanai.com" }` を削除（全ページ伝播を解消）
- `src/app/page.tsx` を Server Component wrapper に変更し LP 専用 canonical を設定
- 旧 `page.tsx` の "use client" コードは `src/app/HomePageClient.tsx` に移動

**M-3（sitemap から /login 除外）**:
- `src/app/sitemap.ts` から `/login` エントリを削除（`/` のみに）

- 詳細: `docs/launch/seo-audit-20260526.md`（監査報告 + 修正ログ含む）

---

## 4. ProductHunt ローンチ

**チャット側記録（git 裏取り不可の操作履歴）**:
- メール認証完了
- Edit launch で Topics 設定: Sales / SaaS / Artificial Intelligence
- Gallery 5枚を設定
- **16:01 JST 自動ローンチ、公開確認済み**

**first comment の修正**（`docs/launch/ph-first-comment-claim-check-20260526.md` で検証）:

Claude Code による実装整合性チェックで2点の誤記を発見・修正:

| 修正箇所 | 修正前（不正確） | 修正後（正確） | 根拠 |
|---------|---------------|--------------|------|
| 無料トライアルの説明 | "no login required" | "Quick signup, no credit card required" | `src/app/api/generate/route.ts:75-81`：未認証時 401 を返す。サインアップ必須。 |
| クライアント追跡の説明 | "what plan they linger on / when they're ready to talk" | "which plan they click on" | `link_events` テーブルは view / plan_selected / pdf_download のみ記録。滞在時間・商談前検知は未実装。 |

**X 共有投稿ドラフト**: 作成済み（チャット内）

---

## 5. 調査・ドキュメント

### 5-1. 対応地域（coverage-area-20260526.md / 16:42 作成）

| 機能 | 対応範囲 | 実装根拠 |
|------|---------|---------|
| AIフロアプラン生成 | 全50州・無制限 | `api/generate/route.ts` — 地域バリデーションなし |
| 近隣データ（Google Maps） | 全50州 | `api/neighborhood/route.ts` — 形式チェックのみ |
| 市場データ（RentCast） | 全米（月50件上限） | `lib/external-apis.ts:13` — `rentcast: { stop: 50 }` |
| MLS物件データ（Trestle） | ユーザーのMLSライセンス依存 | Pro/Team 限定・地域はユーザー権限次第 |

地域ブロック・許可リスト: **一切なし**（grep 確認済み）

### 5-2. SEO 監査（seo-audit-20260526.md / 17:03 作成）

| 優先度 | 問題 | 対応状況 |
|--------|------|---------|
| 🔴 重大（クロール阻害） | なし | — |
| 🟡 中 | JSON-LD 構造化データ欠如 | **未対応（ローンチ後）** |
| 🟡 中 | グローバル canonical 伝播 | **✅ 4e5759d で修正済み** |
| 🟡 中 | sitemap に /login | **✅ 4e5759d で修正済み** |
| 🟢 軽微 | H1 にキーワードなし・twitter:site なし | 未対応（低優先） |

### 5-3. その他（product-facts / oi013）

- `product-facts-for-maker-comment-20260526.md` (09:08): PH Maker コメント用のプロダクト事実集
- `oi013-stripe-verification-20260526.md` (09:29): OI-013 (splanai@gmail.com 作成) は手動タスク・コード変更なし

---

## 6. 戦略上の確定事項（本日判断）

### PH ローンチの位置づけ
- **結論**: ProductHunt は SplanAI の顧客獲得チャネルではない
- 理由: ターゲット（米国中小ホームビルダー・年間10〜50棟）は PH にいない
- **PH ローンチの価値**: SEO バックリンク / 信用の証明 / マイルストーン
- **優先チャネル**: ビルダーへの直接アウトバウンド営業

### 有料 upvote 打診の却下
- アカウント @Real__Mr_P から有料 upvote の打診があった
- **判断**: 関与しない
- 理由: PH 規約違反（票操作）かつ詐欺懸念

### ツール調査・非採用判断
| ツール | 調査結果 | 判断 |
|--------|---------|------|
| Hermes Agent | AI エージェント基盤 | 非採用（顧客が X にいない / 運用負荷） |
| xurl | X URL 短縮サービス | 非採用（X API 固定費） |
| Skill Bundles | Claude Code スキル拡張 | 非採用（現状 Claude Code で充足） |

---

## 7. 翌日以降の残タスク

| 優先度 | タスク | 詳細 |
|--------|--------|------|
| 🔴 高 | アウトバウンド営業開始 | 米国ホームビルダーへの直接アプローチ |
| 🟡 中 | LP の「Launching May 26」文言を更新 | hero badge 以外の残存テキストの確認・修正 |
| 🟡 中 | ProductHuntBadge の state 更新 | `launch-day` → 翌日以降の適切な state へ |
| 🟡 中 | SEO M-1: JSON-LD 構造化データ追加 | FAQPage / SoftwareApplication スキーマ |
| 🟢 低 | テストアカウントクリーンアップ（OI-017） | Supabase +test3〜+test11 / Stripe 顧客レコード |

---

*作成: 2026-05-26 / git コミット 12本・docs/launch/ 当日作成7ファイルを参照*  
*参照ファイル: coverage-area-20260526.md / seo-audit-20260526.md / ph-first-comment-claim-check-20260526.md / ph-badge-live-activation-20260526.md / oi013-stripe-verification-20260526.md / product-facts-for-maker-comment-20260526.md / reply-to-and-c01-fix-20260526.md*
