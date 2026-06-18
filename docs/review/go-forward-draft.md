# SplanAI Go-Forward 再精査 — Claude Code 主導ドラフト
**作成日:** 2026-06-18  
**作成者:** Claude Code (主導)  
**用途:** Codex 独立レビュー → go-forward-final.md 統合前の CC 見解

> **凡例:** 🟢 稼働確認 / 🟡 部分実装 / 🔴 未実装 / ⚪ 該当なし  
> **情報区分:** [repo確認] = コードで裏取り済 / [資料主張] = docs/decisions-log等の記述 / [推測] = 証拠なし

---

## (A) 実地裏取りステータス表

| 項目 | 資料主張 | repo確認結果 | 判定 |
|------|----------|-------------|------|
| Trestle OAuth + AES-256-GCM | PR#17で本番 | `src/app/api/mls/connect/route.ts`: OAuth token取得→encrypt→upsert 実装済 | 🟡 実装あり・e2e未検証(実資格情報まで確認不可。decisions-log でも「真のe2e = 実資格情報まで未検証」と明記) |
| plan_generations INSERT | PRマージ済 | `src/app/api/generate/route.ts` L174: supabase.from('plan_generations').insert({...}) 確認 | 🟢 稼働 |
| nurture-scan cron | スケジュール済 | vercel.json: `"path":"/api/cron/nurture-scan","schedule":"0 22 * * *"` 確認。route.ts: rate_drop / new_concept / re_engagement の3トリガー実装済 | 🟡 スケジュール+実装あり・顧客0なので実質発火なし |
| アナリティクス計装 | 欠落指摘あり | layout.tsx: `@vercel/analytics` のみ。HomePageClient.tsx: `track("generate_success")` `track("cta_click")` の2イベントのみ。signup_complete / trial_started / upgrade_click / form_submit等の漏斗イベントはゼロ | 🔴 重要ファネルイベント未計装 |
| LP Reviews | 要検討 | HomePageClient.tsx L121: `testimonials: { items: [] as const }` (空配列ハードコード)。id="reviews" セクションは "What you get" に偽装した製品説明。nav の "Reviews" は空コンテンツへのリンク | 🔴 実際のレビューなし |
| Daily Brief KPI | MRR/trialing含む | daily-brief/route.ts: finance_snapshots テーブルからMRR/mrrDelta/trialing/churnedToday を読み込む実装確認 | 🟢 稼働 (ただし顧客0=全部ゼロ) |
| CAN-SPAM 物理住所 | バーチャルオフィス要 | emails.ts: フッターは `© 2026 SplanAI · splanai.com` のみ。物理住所なし。privacy.tsx L140 / terms.tsx L176 にTODOコメント残存 | 🔴 未実装(法的リスク: nurture送信前に必須) |
| 需要トリアージ/スコアリングエンジン | [要Fable5] 保留 | repo全体grep: 「triage」はdaily-brief prompt内の"Email Triage"のみ。demand scoring logic なし | ⚪ 未着手(意図的保留) |
| sales.md LinkedIn記述 | 田中MTG後=最優先 | sales.md §1: "LinkedIn — MRR $500 到達後に Sales Navigator $79.99/月検討" (旧記述・未更新) | 🔴 sales.md が田中MTG後の戦略に未追随 |

---

## (B) 6論点 — CC見解と根拠

---

### 論点1: メール0返信の原因診断 ← 最重要

**CC見解: オファー/ICP/メッセージが原因。チャネル(到達)ではない。**

**根拠 [repo確認 + 資料主張]:**
- Homestead Built はポータルを「複数開封」している [資料主張]。複数開封=到達+クリック=「配送問題」は否定される。
- sales.md のパターンB: "Subject: $49 vs hiring another salesperson" は「複数の営業担当が居る」ことを条件にしている。田中MTG後のICP(〜100人の中規模)なら営業チームは当然いる=Pattern Bは刺さるはずだが、返信ゼロ。
- 推測可能な原因の優先度:
  1. **オファー**: "splanai.com — take 30 sec" で終わる。Homesteadが複数開封した後に返信しないのは「30秒で試せるが価値に確信が持てない」という典型パターン。B2Bセールスにおいて試せ=CLOSEではない。
  2. **メッセージと実ICP不整合**: Pattern A/Bは「小規模・1人でいろんな役をこなす」ビルダー向け。中規模(〜100人)向けなら「労働力不足→需要トリアージ」のフレームで語るべき。
  3. **Follow-upなし**: decisions-logには「7日無応答→revival mail」とあるが、これはTrial開始後のフロー。コールドメール後の追客cadenceは未定義。

**LinkedIn転換リスク [推測]:**  
メッセージを変えないままLinkedInに移ると同じ失敗が繰り返される。LinkedIn は「到達」はしやすいが「オファー」が同じなら変わらない。転換前に「Homestead Buildへの追客実験」で仮説を検証するのが最小コスト。

---

### 論点2: ICP の不整合

**CC見解: 田中MTG後に2つの相互矛盾するICPが共存しており、cadenceとpricingがどちらにも最適化されていない。**

**根拠 [repo確認 + 資料主張]:**

| | 旧ICP (sales.md) | 田中MTG後ICP (decisions-log) |
|--|--|--|
| 規模 | 年間5〜80棟、<10人、オーナー経営 | 〜100人、営業チーム有、middle management |
| Channel | Direct email(LinkedIn=MRR $500後) | LinkedIn 最優先 |
| 価格感 | $49が主力 | $149でも安い可能性→上位ティア検討 |
| メッセージ | 「営業1人分コスト削減」「追客漏れ」 | 「人を増やさず需要をさばく」「労働力不足」 |

**現在のコード [repo確認]:**
- Pattern B: "Subject: $49 vs hiring another salesperson" — 小規模向け。100人の会社に送ると的外れ
- Pattern E: "年間棟数 20+ かつ 創業 10 年+" — これは中規模に近い。ただし文面は変わっていない
- 価格表: Free/$49/$149/Custom は未変更。「$149が安すぎる」可能性を decisions-log が認めているのに実コードは据え置き

**結論:**  
資料(sales.md、DM パターン)は旧ICP向けのまま。田中MTGの洞察が decisions-log に記録されただけで、実際のcadence文面・価格・ターゲティング基準に反映されていない。この不整合が「0返信」の構造的背景の一つ。

---

### 論点3: "すべて稼働中" vs 実態 — LinkedInリードが今週trialに来たら何が壊れるか

**影響度順:**

#### 1. CAN-SPAM 物理住所 [法的リスク・高影響] 🔴
[repo確認] emails.ts のすべてのトランザクショナルメール(welcome/trial_reminder/followup/nurture)にフッター住所なし。nurture_scan/route.ts の nurture メールも同様。
LinkedIn → trial → nurture送信 のフローで初めて顕在化する。
**consequences:** CAN-SPAM 違反($50,122/通 の罰則リスク)、ISP信頼スコア低下

#### 2. アナリティクス計装欠落 [診断不能・中影響] 🔴
[repo確認] Vercel Analytics + 2イベント(generate_success / cta_click)のみ。
LinkedIn → LP訪問 → signup → trial → (upgrade / churn) の各ステップの落下点が追跡できない。
**consequences:** ABテストも根拠ある改善も不可。「なぜ転換しないか」が永遠にわからない。

#### 3. LP "Reviews" 空 [信頼性弱・中影響] 🔴
[repo確認] testimonials.items = [] 。ナビの "Reviews" クリックで製品説明セクションが表示される。
建設業でB2B購買を決める人間が見て信頼を損なうリスク。"Be one of our founding builders" のフレームは代替になり得るが弱い。

#### 4. MLS e2e 未検証 [低影響・Pro限定] 🟡
[repo確認 + 資料主張] Trestle OAuthの実装は完全だが、実資格情報でのe2eテスト未実施。
LinkedIn → Pro trial のリードがMLS連携を試みた場合、Trestle側の資格情報エラー時の処理は実装済み(400→ "Invalid credentials" 返却)。致命的ではないが実証できない。

#### 5. nurture送信UI [顧客0では発動しない] 🟡
[repo確認] nurture_drafts への INSERT は実装。しかし「送信」はどこで行うか?  
dashboard/DashboardClient.tsx に送信UIがあるか確認が必要 [未確認・要追加調査]。draft生成だけでビルダーへの通知・送信フローが未完成な可能性。

---

### 論点4: ウェッジと製品の差

**CC見解: 現製品は「バイヤー intent 可視化」ツールであり、「需要トリアージ」は aspirational。ただし中規模ビルダーへの訴求には intent通知の部分で現時点でも十分な実体がある。**

**[repo確認] 現製品が実際に提供するもの:**
- ✅ 30秒で3案 → 提案コスト削減
- ✅ ポータル開封通知 (link_events: view, plan_selected, pdf_download, prequal_click)
- ✅ nurture-scan: rate_drop/new_concept/re_engagement の3トリガーで追客下書き自動生成
- ✅ 案件ごとの buyer engagement スコア (daily-briefのfetchHotLeads)

**✗ 現製品が提供しない「トリアージ」:**
- 複数案件を横断した「どの客を今週追うべきか」の優先順位付け
- 需要ボリューム vs 建設キャパシティの需給マッチング
- 見込み客の「本気度」自動スコアリング (prequal_click > plan_selected > view は日次briefに出るが、ビルダーUIには未露出)

**cadence過大訴求リスク [推測]:**  
田中MTGでのピッチ「人を増やさず需要をさばく」= トリアージエンジンが前提。LinkedIn cadence でこのフレームを使うとデモで落差が出る可能性。「追客漏れを防ぐ + 本気の客を見つける」の方が現製品に正直。

---

### 論点5: シーケンスと田中フィーのゲート

**CC見解: 田中フィーは「最初の1返信/1 trial を取る」クリティカルパス上の何もブロックしていない。最小検証スタックは Apollo 1ツールのみ。**

**[repo確認 + 資料主張] 分析:**

decisions-log から確認できる事実:
- Plan B予算 ¥100万/年 の経常費は確定済み ($331/月≈¥53K): Apollo/Claude Max/Codex Pro/Loom/Calendly/Zillow/インフラ
- LinkedIn Sales Navigator ($90/月) は "outbound 稼働後に追加判断" = 今は不要
- 田中フィーの "引き出し条件" は decisions-logに具体的記述なし [資料主張から確認不可]
- 田中MTGのaskは "バリデーション + 紹介2-3件" のみ。调达ではない

**「最初の1返信/1 trial」に Plan B 課金が要る項目:**
- Apollo Professional ($79/月): LinkedIn連絡先の email discovery + cadence管理。**これが唯一の必須新規ツール**
- それ以外: Claude Max / Codex Pro は開発用で既存。Calendly は demo booking用で$12/月済

**田中フィーのゲート評価:**  
現在議論されている "田中預け分の引き出し" はLinkedIn Sales Nav ($90/月) や、より大きな施策(特許、LLC等)が主な用途候補。これらはいずれも「最初の1返信」の前には不要。田中フィーはゲートではなく、スケール時の選択肢。**現段階は正しく後回し。**

---

### 論点6: 2大ファネル弱点の優先度

**CC見解: アナリティクス(signup/trial漏斗)は即実装すべき。LP Reviewsは顧客獲得後まで後回し正当化できる。ただし現状の "Reviews" ナビラベルは修正要。**

**[repo確認] 実態:**

**アナリティクス欠落:**
- 現状: generate_success + cta_click (2イベント)
- 欠落: signup_complete / login / trial_started / upgrade_initiated / upgrade_success / share_link_created
- LinkedIn リードが来たとき、「LP→signup→trial→upgrade の何ステップ目で離脱したか」が追跡不可
- 実装コスト: 低(Vercel Analytics の track() 呼び出し追加、数時間)
- 放置コスト: 「なぜ転換しないか」が永遠にわからない → 改善仮説が立てられない

**LP Reviews:**
- testimonials.items = [] は即修正が必要ではないが、nav の "Reviews" ラベルが空コンテンツへリンクしているのは誤解招く
- "Be one of our founding builders" + "Built by a solo founder. No design agency. No fluff." の文言は現時点のSocial Proof代替として機能している
- 真の顧客レビューはFirst Paying Customerまで得られない。今取り組むのは時期尚早

**優先度:**
1. ✂️ nav "Reviews" ラベルを "Demo" または "See it work" に変更 (数分)
2. 🔴 CAN-SPAM 物理住所 実装 (nurture送信前に必須・法的ゲート)
3. 🟡 signup/trial漏斗 analytics イベント追加 (LinkedIn outbound 開始前に実装推奨)
4. ⏳ LP Reviews: First Paying Customer 獲得後

---

## (C) go-forward 次手 — 優先順位引き直し案

### 最優先(今週・LinkedIn開始前にやり切る)

| # | アクション | 根拠 | 工数 |
|---|-----------|------|------|
| C1 | **sales.md + DM パターンの田中MTG後ICP対応改訂** | ICP不整合が0返信の主因候補。Patternを中規模(〜100人・営業チーム有)向けに書き直す。ウェッジ="労働力不足→トリアージ"を正直な訴求("追客漏れ防止+本気度可視化")に調整 | 1-2h |
| C2 | **Homestead Built 追客実験** | 到達は確認済み。既存の"最温リード"に対し異なるオファー(デモCTA / 具体的なROI数字)で追客→返信率を計測。LinkedIn転換前の最小仮説検証 | 30min |
| C3 | **CAN-SPAM 物理住所実装** | [repo確認] emails.ts に住所なし。nurture送信前に法的必須。バーチャルオフィス住所をemails.tsのフッターに追加 | 2-4h(住所取得が律速) |
| C4 | **signup/trial 漏斗 analytics イベント追加** | LinkedIn leadが来たとき診断可能にするための最小計装。auth/confirm, upgrade/checkout にtrack()追加 | 2-4h |

### 高優先(今月中)

| # | アクション | 根拠 |
|---|-----------|------|
| C5 | **nav "Reviews" → "Demo" or "See it work" に変更** | 空コンテンツへのリンクは信頼損失。LP改修中に同時修正 |
| C6 | **LinkedIn cadence 文面の新ICP最適化版ドラフト** | C1とセット。中規模ビルダーの Decision Maker (VP Sales / Owner) 向けに書き直し |
| C7 | **Homestead Built 追客結果 → ICP/メッセージ仮説の更新** | C2の結果が出たら decisions-log に反映 |

### 後回し(First Paying Customer 後)

| # | アクション | 根拠 |
|---|-----------|------|
| C8 | LP Reviews/Testimonials | 顧客ゼロでは埋まらない |
| C9 | MLS e2e 実証 | Pro trialが来てから |
| C10 | 需要トリアージ/スコアリングエンジン [要Fable5] | 核心機能だが現製品でもintent通知は実体あり。Pivot前に製品追加不要 |
| C11 | 価格見直し (中規模向け上位ティア) | $149が安すぎる説は有効だが、まず顧客を1社取って価格感を検証 |

---

## (D) 未解決の不明点

1. **nurture 送信 UI の有無**: DashboardClient.tsx に「nurture draft の確認 + 送信」フローがあるか未確認。draft生成だけで送信UIが未実装なら実質デッドコード。[追加調査推奨]

2. **Homestead Built 追客の実行状況**: 複数開封のリードに対して追客を試みたか、試みたならどの文面でいつ送ったか、の記録が decisions-log / outreach_log にあるか未確認。

3. **outreach_log テーブルの現在の内容**: 26社/31通の詳細(送信日/Pattern/State/返信状況)の分布が Supabase 側にあるが CC は見えない。Pattern B を何社に送ったか等の詳細が仮説精度に影響する。

4. **田中フィーの引き出し条件**: decisions-log に "引き出すなら ~¥10-50万規模" とあるが、具体的な引き出し条件(何を達成したら / どんな用途で)が記述されていない。Plan B 投資判断の全体像に影響。

5. **LinkedIn Sales Nav vs Apollo の役割分担**: Apollo は email discovery + cadence。LinkedIn は直DM。両者のsourcingとcadenceがどう連携するかの運用設計が未定義。

6. **Codex の repo アクセス権確認**: Codex が homeplan-ai repo を読めるか(SSH key / GitHub token) は CC から確認不可。Codex 側の環境前提として要確認。

---

*次手: Codex独立レビュー → docs/review/codex-critique.md → go-forward-final.md 統合*
