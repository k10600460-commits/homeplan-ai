# SplanAI ローンチ後営業戦略 — 記録集約

**作成日**: 2026-05-26  
**調査対象**: agents/ / docs/launch/ / obsidian-vault/ / .claude/memory/ / git log  
**方針**: 記録に実在する内容のみ。推測補完なし。各項目に出典を明記。

---

## 1. 記録から見つかった営業手法・アイデア一覧

### 1-A. ターゲット選定

| 条件 | 内容 | 出典 |
|------|------|------|
| 規模 | 年間 5〜80 棟のオーナー経営ビルダー | `agents/sales.md §1` |
| 優先州 | TX / FL / NC / GA / AZ / TN / SC / CA / CO（住宅着工数 Top 9） | `agents/sales.md §1` |
| 除外 | 大手コーポレートチェーン・仲介専業・管理会社 | `agents/sales.md §1` |
| 最低条件 | Website あり（最低限のリテラシー確認） | `agents/sales.md §1` |

---

### 1-B. 見込み客リスト作成データソース

| 優先順 | ソース | 備考 | 出典 |
|--------|--------|------|------|
| 1 | Google Maps Places API — `home builder [city]` 検索 | 無料・自動化可 | `agents/sales.md §1` / `master-todo-post-launch.md §3.1.2` |
| 2 | NAHB Member Directory — 公開部分 | 手動スクレイピング | 同上 |
| 3 | LinkedIn Sales Navigator | $79.99/月 / **MRR $500 到達後に検討** | 同上 |

`outreach_log` テーブル（Supabase）で管理。テーブル定義は `agents/sales.md §2` に SQL 記載済み。

---

### 1-C. アウトバウンド DM — 5 パターン

| パターン | タイトル | 使用条件 | 出典 |
|---------|---------|---------|------|
| A | 「追客漏れ減らせます」 | Web に follow-up 系のヒントあり | `agents/sales.md §3` / `master-todo-post-launch.md §3.1.3` |
| B | 「営業 1 人分削減」 | Web に複数の営業担当の名前あり | 同上 |
| C | 「MLS をもっと売上化」 | Web に「MLS / listings / Trestle」の言及あり | 同上 |
| D | 「来場率改善」 | Web に「model home / open house」が前面に出ている | 同上 |
| E | 「失注復活」（最強） | 年間棟数推定 20+ かつ 創業 10 年以上の established ビルダー | 同上 |

パターン判定はエージェントが各社 Web / Facebook を `web_fetch` で分析して自動選択。
デフォルト（どれも当てはまらない）: Pattern A。（`agents/sales.md §4`）

---

### 1-D. セールス自動化フロー（Semi-auto）

```
毎朝 8:00 JST: /api/cron/sales-dm-draft 起動
  → outreach_log から status='pending' の 5 社を取得（TX/FL/NC 優先）
  → 各社 Web を分析 → パターン判定
  → DM ドラフト生成
  → obsidian-vault/YYYY-MM-DD-sales-drafts.md に保存
  → Shuraemon がレビュー → LinkedIn / Email で手動送信
  → outreach_log の status を 'sent' に更新
```

出典: `agents/sales.md §5` / `master-todo-post-launch.md §3.1.4`

---

### 1-E. 返信→Demo→成約 ファネル

```
pending → sent → replied → qualified（Zoom 予約）→ demo_done → trial_started → paid
                                                               └→ 7 日無応答 → revival mail
```

- revival mail 件名: "Still thinking about [Company]? Here's what changed."
- ファネル管理: `outreach_log` テーブルで status 遷移
- 全遷移は Commander が Daily Brief に集約してエスカレーション

出典: `agents/sales.md §6` / `agents/commander.md §2.2`

---

### 1-F. White-glove オンボーディング（最初の 5 社）

- Zoom 60 分 × 週 1 × 4 週間（合計 4 回）
- `obsidian-vault/white-glove/[company-name].md` に記録
- **必ず収集する Before/After 数値**: 月間プラン生成数 / 平均顧客応答時間 / 商談化率 / 月間受注件数
- 4 週間後: Sales Agent が事例ページ草稿を生成
- 事例は「次の 50 社 DM の社名・数値」として再活用

出典: `agents/sales.md §7` / `master-todo-post-launch.md §3.1.6`

---

### 1-G. 30 日 KPI 目標

| KPI | 保守 | Stretch | 出典 |
|-----|------|---------|------|
| DM 送付数 | 100 社 | 200 社 | `agents/sales.md §8` |
| DM 返信率 | 15% | 25% | 同上 |
| Demo / Zoom | 5 本 | 15 本 | 同上 |
| White-glove 完成 | 3 社 | 5 社 | 同上 |
| 有料転換 | 15 社 | 30 社 | 同上 |

---

### 1-H. LP / SNS コンテンツ経由の自然流入

- X (@SplanAI): build-in-public をマーケの柱。一人称 "I"。ハッシュタグなし。
- LinkedIn: ストーリー型・数字型の 5 投稿セット（ローンチ用、post-launch 更新未記載）
- Reddit: r/homebuilding / r/realestate / r/SaaS / r/Entrepreneur への投稿（ローンチ時）
- NAHREP: EN/ES 両言語の 5 投稿（ヒスパニック系ビルダーコミュニティ向け）
- ProductHunt Maker's Comment: 創設者ストーリー + "Who it's for" セクション

出典: `obsidian-vault/step11-launch-sales.md §1-§3`

---

### 1-I. 価格・プランを絡めた営業設計

| ポイント | 内容 | 出典 |
|---------|------|------|
| エントリー訴求 | Free は 3 回 / クレカ不要 → 試用の敷居ゼロ | `agents/sales.md Pattern B` / `README.md` |
| Pro 訴求 | $49 vs 営業担当 1 人雇う vs 仕事を取りこぼすコスト | `agents/sales.md Pattern B` |
| Team 訴求 | 白ラベル PDF → ビルダー自社ブランドでクライアントに提案できる | `docs/launch/plan-differentiation-matrix-20260524.md` |
| Pro と Team の実質差 | White-label PDF + チーム管理（最大 15 人）の 2 点のみ | `docs/launch/plan-differentiation-matrix-20260524.md` |
| MLS 訴求 | "Same MLS, 4x the close rate" — Trestle 連携は Pro/Team のみ | `agents/sales.md Pattern C` |

---

### 1-J. SEO — 間接的な営業チャネル

長尾キーワードで builder が検索するコンテンツを週 2 記事ペースで作成。

| 週 | 記事テーマ | 出典 |
|----|----------|------|
| 1 | "Best CRM for small home builders 2026" | `master-todo-post-launch.md §3.2.1` |
| 1 | "MLS software for home builders" | 同上 |
| 2 | "Home builder follow-up system: 5 strategies that work" | 同上 |
| 2 | "How to use MLS as a home builder (not just an agent)" | 同上 |
| 3 | "Construction sales CRM: builder-specific vs generic" | 同上 |
| 3 | "Builder lead nurturing playbook" | 同上 |
| 4 | "AI floor plan generator for builders: 2026 comparison" | 同上 |
| 4 | "Why small builders lose deals (and how to fix it)" | 同上 |

各記事に一次情報（white-glove 事例の数値）を 1 つ以上含める方針。

---

### 1-K. 市場ポジショニング・差別化

| 論点 | 内容 | 出典 |
|------|------|------|
| MLS 閉鎖性が有利 | HomePlanAI は MLS 非依存 → 競合参入を阻む外側で戦える | `step12-market-analysis-roadmap.md §1` / `memory/market-analysis.md` |
| NAR 訴訟後の追い風 | エージェント淘汰 → ビルダー直販 AI ツール需要増 | `step12-market-analysis-roadmap.md §2` |
| UX 品質優位 | 日本人の細かい UX がアメリカ SaaS 競合に対して差別化 | `step12-market-analysis-roadmap.md §5` |
| データが護城河 | 行動データ（何を生成し何を選んだか）/ 成約相関データ / 市場データ | `memory/market-analysis.md §M&A価値` |
| 他国展開 | スペイン語対応済み → 中南米（メキシコ・コロンビア）・UAE・インド | `memory/market-analysis.md §他国展開` |

---

### 1-L. パートナーシップ・連携先案（将来）

| 企業 / カテゴリ | 関係性 | ステータス |
|--------------|--------|---------|
| ATTOM / Regrid / Cotality / LandLogic | データインフラ企業。SplanAI がその上に AI 層を被せる | アイデア段階 |
| SMS 追客 (Twilio) | 返信があったビルダーに SMS フォローアップ | ロードマップ（M 工数） |
| Zapier Webhook | 外部 CRM との連携 | ロードマップ（S 工数） |
| Chrome 拡張 | 不明 | Month 3 以降 |

出典: `memory/market-analysis.md §ロードマップ` / `step12-market-analysis-roadmap.md`

---

## 2. ステータス一覧

| 項目 | ステータス |
|------|---------|
| DM 5 パターン（A〜E） | **実装済み**（`agents/sales.md` に完成版あり） |
| Sales Cron `/api/cron/sales-dm-draft` | **実装済み**（コードに route.ts あり / 毎朝 8:00 JST） |
| `outreach_log` Supabase テーブル | **設計済み**（SQL あり）/ **作成未確認**（DB に実在するかコード上で未検証） |
| 50 社初版リスト作成 | **未実行**（ローンチ翌日から着手予定） |
| White-glove 初回 Zoom | **未実施**（顧客 0 社の段階） |
| LinkedIn Sales Navigator | **保留**（MRR $500 到達後に検討） |
| SEO 記事 8 本 | **未着手**（テーマリストのみあり） |
| LP v2 Phase 2（Pain section 移動・copy 修正・事例ギャラリー） | **保留**（ローンチ後） |
| SMS 追客 Twilio | **ロードマップ**（M 工数 / 時期未定） |
| Zapier Webhook | **ロードマップ**（S 工数 / 時期未定） |
| ATTOM / Regrid 連携 | **アイデア段階** |
| 中南米・UAE・インド展開 | **アイデア段階** |

---

## 3. 決定事項と未決定・未記載の切り分け

### 確定済み決定事項

| 決定 | 内容 | 出典 |
|------|------|------|
| 営業チャネルはアウトバウンド DM 中心 | PH / X は SEO / 認知目的。顧客獲得は Direct Outreach | `agents/sales.md Mission` / `CLAUDE.md` |
| DM は Semi-auto（エージェントドラフト→人間送信） | 全自動は採用しない | `master-todo-post-launch.md §0` |
| 最初の 5 社は white-glove（Zoom 4 回）で事例化 | 次の 50 社への説得材料を作る目的 | `agents/sales.md §7` |
| PayPal は採用しない | Stripe 日本アカウントでは使用不可 | `CLAUDE.md §Payments` |
| LinkedIn Sales Navigator は MRR $500 後に検討 | それまではフリーソースのみ | `agents/sales.md §1` |
| 30 日目標: 有料転換 15 社（保守）/ 30 社（Stretch） | | `agents/sales.md §8` |
| Team プランの実質差別化は White-label PDF + チーム管理のみ | 生成数・MLS は Pro と同等 | `docs/launch/plan-differentiation-matrix-20260524.md` |
| Shuraemon 時間配分目標: 営業 40% / 戦略 30% / 改善 20% / 雑務 10% | | `master-todo-post-launch.md §0` |

### 未決定・記録上の空白（「未記載」）

| 論点 | 状態 |
|------|------|
| DM 送付チャネル（LinkedIn DM vs Email vs 両方）の使い分けルール | **未記載**（`agents/sales.md` には "LinkedIn / Email で手動送信" とのみ記載） |
| 初回 50 社リストの具体的な作成手順・担当（Shuraemon 手動 or エージェント自動） | **未記載**（データソースの優先順はあるが手順なし） |
| `outreach_log` テーブルが Supabase に実際に存在するか | **未確認**（SQL 定義はあるが migration 実行の記録なし） |
| Revival mail の本文 | **未記載**（件名のみ: "Still thinking about [Company]? Here's what changed."） |
| Demo / Zoom の進行台本・提案構成 | **未記載** |
| Trial → 有料転換のフォローアップメール本文 | **未記載**（`lib/emails.ts` に trial-reminder は実装済みだが、営業メッセージとしての設計なし） |
| Team プランの営業トーク（対 Pro との差別化・白ラベル訴求） | **未記載**（DM 5 パターンは Pro 訴求のみ） |
| パートナーシップ・紹介営業の設計 | **未記載**（将来案として ATTOM 等の名前はあるが具体設計なし） |
| ACH 支払い（US B2B SaaS）の導入判断基準・時期 | **未記載**（「将来検討」との記載のみ） |
| 既存 Free ユーザーへのアップセル施策 | **未記載** |
| チャーン（解約）後の復活施策 | **未記載**（commander には churn escalation はあるが営業アクションなし） |

---

## 4. 営業本格化に向けた記録上のギャップ

| ギャップ | 具体的に何が足りないか |
|---------|-------------------|
| **Zoom デモ設計が存在しない** | `qualified`（Zoom 予約）から`demo_done` への遷移はフローに記載されているが、デモの内容・進行・スクリーン構成・クロージング手順が一切記録されていない。対面 or 画面共有のどちらで SplanAI を動かすか未定。 |
| **Team プラン向けの DM が存在しない** | DM 5 パターンはすべて個人ビルダー（Pro）訴求。チーム・会社規模の見込み客向けトークが記録に存在しない。 |
| **インバウンド（問い合わせ）対応フローが未設計** | `agents/support.md` は存在するが（確認済み）、営業への引き渡し基準・hot lead の定義・返信 SLA が Sales Agent 側に記載されていない。 |
| **競合比較・FAQ の営業版が未作成** | LP の FAQ はあるが、DM 返信時に送る「競合との比較表」「よくある質問への回答集」が記録に存在しない。 |
| **初期 50 社リスト未作成** | データソースと SQL は定義済みだが、実際のリストが存在しない（ローンチ後着手を前提とした設計）。 |
| **事例・数値が 0 件** | DM Pattern A〜E はすべて「代表的なビルダー」という一般論。実際の事例（"Builder in TX saw 2x close rate"）は white-glove 完了後でなければ作れない。最初の 30〜60 日は証拠なしで説得する必要がある。 |
| **チャーン後の営業アクションが未設計** | Commander の escalation に "MRR 前日比 -10%" はあるが、解約したユーザーへの再アプローチ施策が記録に存在しない。 |

---

**参照ファイル一覧**

| ファイル | 営業関連の主要内容 |
|---------|----------------|
| `agents/sales.md` | ターゲット基準 / DM 5 パターン / ファネル管理 / White-glove ルール / KPI |
| `agents/commander.md` | エスカレーション判定 / Daily Brief 構成 / 自動化プロトコル |
| `obsidian-vault/master-todo-post-launch.md` | エージェント全体アーキテクチャ / SEO 週次計画 / outreach_log SQL |
| `obsidian-vault/step11-launch-sales.md` | PH Hunter DM / SNS 投稿 20 本 / NAHREP 投稿 / ローンチ当日タイムライン |
| `obsidian-vault/step12-market-analysis-roadmap.md` | 市場分析 / 差別化論点 / 他国展開 / データ護城河 |
| `.claude/memory/market-analysis.md` | ChatGPT 分析サマリー / M&A 価値 / 競合・連携先 |
| `docs/launch/plan-differentiation-matrix-20260524.md` | Pro vs Team の実装上の差（営業設計の根拠） |
| `CLAUDE.md §Customer & go-to-market` | "PH はSEO/credibility。顧客獲得はアウトバウンド" の明示 |

---

## 6. 営業手法の棚卸し（自動化・コスト別）

**追記日**: 2026-05-26

### 6-1. 手法一覧

| 手法 | 自動化 | コスト |
|------|--------|--------|
| 厳選リストへのコールドメール/DM | 半自動 | 無料 |
| Google マップでビルダー発掘 | 半自動（発掘）/手作業（接触） | 無料 |
| 実物件で「サンプル提案」を生成して送る | 半自動 | 無料（自社プロダクト） |
| 地域 HBA（NAHB/地域協会） | 手作業 | 有料（会員費）※名簿・公開イベント情報の活用は無料 |
| Facebook グループ/Reddit/ビルダー系フォーラム | 手作業 | 無料 |
| コールドコール | 手作業 | 無料 |
| LinkedIn | 半自動 | 基本無料 / Sales Navigator は有料 |
| 顧客ポータル `/s/[slug]` のバイラルループ | 自動 | 無料（内蔵） |
| SEO・ブログ/YouTube デモ動画/ディレクトリ掲載 | 自動（資産化後） | 無料（無料枠） |
| 紹介・パートナー（ローン業者・不動産エージェント・建材業者） | 手作業 | 無料 |
| 業界ニュースレター/メディアスポンサー | 半自動 | 有料 |

### 6-2. Google マップ営業の注意点

発掘には有効。ただし大量スクレイピングは Google 規約違反、問い合わせフォーム一斉送信はスパム扱い・低転換・評判リスク。実行版は「発掘→担当者特定→実物件のサンプル提案を添えて個別送信」。

### 6-3. 決定事項

- **無料の手法はすべて実行する。**
- **有料の3つ（HBA 会員費 / Sales Navigator / 有料メディアスポンサー）は後回し**、MRR・予算が立ってから判断。
- **初期60日の主役**: コールドメール/DM + サンプル提案アウトリーチ + コールドコール。並行で受動資産（SEO・デモ動画・ポータルのバイラルループ）を仕込む。
