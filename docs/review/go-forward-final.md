# SplanAI Go-Forward 再精査 — Final統合版
**作成日:** 2026-06-18  
**CC主導 + Codex独立レビュー → 統合**  
**用途:** chat-Claude への最終戦略統合・go/no-go 枠組み化インプット

> 本ドキュメントは repo 実地調査ベース。Tanaka MTG 結論・Homestead Built 行動等の
> off-repo 事実は `[off-repo]` で明示し、repo 確認事実と区別する。

---

## 0. 両モデルで確定した最重要事実

Codex が CC の見落としを3件指摘し、CC見解を1件修正、2件は両者合意で確定した。

| 事実 | CC初稿 | Codex修正 | 確定状態 |
|------|--------|-----------|---------|
| Nurture 送信 UI | 未確認(D項の不明点) | `/api/nurture/[id]/send/route.ts` + DashboardClient.tsx L877-1211 で実装確認 | ✅ 存在する |
| Intent scoring/露出 | 「需要トリアージなし」 | `intent-signals/route.ts` HOT/WARM/COLD + Dashboard Buyer Activity 確認 | ✅ 部分実装あり |
| sales-dm-draft cron | 未確認 | スケルトン実装 (status: "skeleton" を返すだけ) | ✅ 実質未機能 |
| CAN-SPAM ペナルティ | $50,122 | FTC現行: $53,088/通 | ✅ $53,088 が正 |
| analytics イベント数 | 2イベント | 3イベント (generate_success, cta_click, signup) | ✅ 3イベント |
| LP Reviews 空 | 空確認 | 同確認 | ✅ 空 |
| CAN-SPAM 住所なし | 全メール | nurture send 経路も同確認 (send/route.ts:17-23) | ✅ 全経路で未実装 |

---

## 1. 合意点 (両モデルが証拠ベースで一致)

### 1-A. CAN-SPAM 物理住所は最優先の法的リスク
- `src/lib/emails.ts` (welcome/trial_reminder/followup/cancel/invite) 全フッターに住所なし
- `src/app/api/nurture/[id]/send/route.ts:17-23` の nurture送信経路も住所なし  
- `src/app/privacy/page.tsx:140` / `src/app/terms/page.tsx:176` に未解決 TODO コメント
- **nurture send UIが存在しダッシュボードから送信可能な今、real sendが起きる前に実装必須**
- ペナルティ: $53,088/通 (FTC, 2024現行)

### 1-B. アナリティクス: 漏斗の中核が空白
- 現計装: `generate_success` / `cta_click` / `signup` (3イベント)  
- 欠落: `checkout_started`, `trial_started`, `checkout_success`, `share_link_created`, `portal_lead_created`, `nurture_sent`, `upgrade_click`
- 注意: `auth/confirm/route.ts` 等のサーバー経由のマイルストーンは client `track()` で拾えない  
  → Stripe webhook / route handler 側に `analytics_events` DB ログ or post-redirect client events が必要
- LinkedIn lead が来て「どこで落ちたか」が見えない = 改善仮説が立てられない

### 1-C. LP "Reviews" は信頼損失リスク
- `HomePageClient.tsx:118-122`: `testimonials.items: [] as const` (空)
- nav "Reviews" → `#reviews` は "What you get" 製品説明セクション (id一致だが内容不一致)
- **修正コスト: 数分。nav ラベルを "Demo" / "See Output" に変更するだけ**

### 1-D. ICP 資料が旧状態のまま
- `agents/sales.md`: 「年間5〜80棟、LinkedIn = MRR $500後」 [repo確認]  
- `docs/launch/post-launch-sales-20260526.md`: Direct outreach / Sales Nav after $500 MRR [repo確認]  
- 田中MTG後の「〜100人中規模・LinkedIn最優先」は decisions-log の off-repo 記述のみ [off-repo]  
- **sales.md は実際の戦略と乖離したまま**

### 1-E. sales-dm-draft cron はスケルトン
- `src/app/api/cron/sales-dm-draft/route.ts`: outreach_log 接続確認のみ・status: "skeleton" を返す  
- vercel.json でスケジュール済みだが実質未機能  
- **「DM 自動化済み」は誤認。手動 cadence に依存している**

---

## 2. 相違点 (各モデルの主張と根拠)

### 2-A. 論点1: 0返信の原因診断

**CC主張:** Homestead Built が複数開封しているため到達(配送)問題ではなく、オファー/ICP/メッセージが原因。LinkedInへの転換は同じ失敗を繰り返すリスクがある。

**Codex反証:** Homestead Built の行動は off-repo 証拠 [off-repo]。repo が提供できるのは「sales playbook が旧 ICP 向け」「sales cron がスケルトン」という事実のみ。0返信の原因は配送・パーソナライゼーション・CTA・ペルソナ・フォローアップ欠如・単純なサンプルサイズ不足のいずれでもあり得る。チャネルとオファーのどちらが問題か断定できる証拠はない。

**Codex代替提案:** 「0返信の原因を診断すること自体が次の実験目的。まず10-20社に対して厳密に記録された手動アウトリーチを行い、配送確認(SPF/DKIM)+開封率+返信率を計測してから診断する」

**未解決:** どのパターン(A/B/C/D/E)を何社に送ったか、outreach_log の詳細は Supabase 側のみで CC/Codex ともに確認不可。

**統合見解:** CC の「オファー/ICP問題」は Homestead 証拠で説得力があるが過断定。Codex の「計測してから判断」が科学的に正しい。**但し Homestead Built への追客実験は最小コストの検証であり実施すべき。** LinkedIn転換はその並行作業として位置づけ、同じパターンを持ち込まないことを守る。

---

### 2-B. 論点2: ICP 不整合の扱い

**CC主張:** 田中MTG後に小規模/中規模の2つのICPが共存している。Pattern B ("$49 vs hiring another salesperson") は中規模向けに送ると的外れ。ICP転換を前提に cadence を全面改訂すべき。

**Codex反証:** 田中MTGのICP転換は off-repo [off-repo]。repo が示す公式戦略は小〜中規模直接アウトリーチのまま。「100人規模へのピボット」を前提に sales.md を書き換えるのは、off-repo コンテキストに依存した飛躍。まず ICP 定義の source-of-truth ドキュメントと ターゲットアカウントリストを作ることが先。

**未解決:** 田中MTG後の新ICP が decisions-log 以外に source-of-truth として存在するか不明。

**統合見解:** Codex が正しい。CC は off-repo 証拠(decisions-log)に重きを置きすぎた。**行動指針: 田中MTG後ICP(〜100人中規模)を仮説として、10〜20社のターゲットリストを作成し、その結果を見てから sales.md の改訂範囲を決める。** 今すぐ全面改訂するのは早計。

---

### 2-C. 論点4: ウェッジと製品の差 (Intent Scoring)

**CC主張:** 需要トリアージ/スコアリングエンジンは repo に存在しない。現製品は「バイヤー intent 可視化」のみ。「人を増やさず需要をさばく」ピッチはアスピレーショナル。

**Codex修正(重要):**  
`src/app/api/intent-signals/route.ts` が存在する:
- `HOT / WARM / COLD` の heat 分類 (L30-40)
- next action の自動決定 (L43-67)
- Dashboard Buyer Activity セクション (DashboardClient.tsx L1066-1134) に露出
- Hot Leads セクション (L929-957) にも露出

Codex 見解: 「buyer-intent ranking surface は存在する。ただし builder capacity モデリング / 需給マッチング / deal probability / revenue-prioritized work queue はない」

**統合見解:** CC が intent-signals API を見落とした。**正確な現状: 「バイヤーの熱量ランキング(HOT/WARM/COLD)は実装・露出済み。需要トリアージの上位層(builder側のキャパシティ管理/案件優先度スコアリング)は未実装。」** LinkedIn cadence で「本気の買い手を見つける」は現製品で言える。「人を増やさずに需要をさばく」は aspirational ではあるが、intent scoringの実体でビルダーに見せられるデモがある。

---

### 2-D. 論点5: Plan B ゲートと最小検証スタック

**CC主張:** 田中フィーはクリティカルパスをブロックしていない。Apollo が唯一の必須新規ツール。

**Codex反証:** Apollo の必要性は repo から検証できない [off-repo 依存]。sales cron がスケルトンである以上、ボトルネックは「リードソーシングのボリューム」ではなく「ターゲットリスト / パーソナライゼーション / フォローアップ cadence / 計測」の運用設計にある。最安の検証パスは Apollo ではなく「手動・記録付きの 10-20 社アウトリーチ」。Apollo は「email discovery ボリュームがボトルネック」と確認されてから買えばよい。

**統合見解:** Codex の方が保守的かつ正しい。**Apollo ($79/月) は保留でも最初の1返信は取れる。LinkedIn の無料機能(手動DM)+手動 cadence ログで実験し、その後 Apollo / Sales Nav の判断をする。**

---

## 3. 改訂優先順位 (統合案)

### P0 — LinkedIn outbound 開始前に必須(法的・診断)

| # | アクション | 根拠 | 工数 |
|---|-----------|------|------|
| P0-1 | **CAN-SPAM 物理住所を全メールフッターに実装** | emails.ts 全テンプレート + nurture send route に住所なし。nurture UI から実際に送れる今が法的ゲート | 数時間(住所取得が律速) |
| P0-2 | **サーバー側ファネルイベント logging** | Stripe webhook / auth/confirm / checkout success に analytics_events テーブル書き込み or post-redirect client track。「どこで落ちたか」が見えないと LinkedIn 実験が計測不能 | 半日 |

### P1 — 今週中 (LinkedIn 開始と同時並行)

| # | アクション | 根拠 |
|---|-----------|------|
| P1-1 | **sales.md に暫定ICP仮説セクションを追記** | 旧ICP(5-80棟)は維持しつつ、田中MTG後の中規模仮説(〜100人)を「検証中」として明記。10-20社ターゲットリスト作成のベース |
| P1-2 | **nav "Reviews" → "Demo" or "See Output" に変更** | 修正コスト数分、信頼損失リスクを即排除 |
| P1-3 | **Homestead Built 追客実験** | 最温リードへ異なるオファー(デモ動画/具体ROI)を手動送信→開封・返信を記録。「チャネル vs オファー」仮説の最小検証 |
| P1-4 | **10-20社 手動記録付き LinkedIn DM 実験** | 中規模 ICP 仮説の検証。件名・パターン・返信・開封日を spreadsheet に記録。Apollo/Sales Nav 不要 |

### P2 — First Paying Customer 後

| # | アクション | 根拠 |
|---|-----------|------|
| P2-1 | LP Reviews / Testimonials | 顧客ゼロでは埋まらない |
| P2-2 | MLS e2e 実証 | Pro trial リードが来てから |
| P2-3 | sales-dm-draft cron 本実装 | スケルトンを脱出してDM自動化 |
| P2-4 | 価格見直し (中規模向け上位ティア) | $149が安すぎる説は仮説。1社 paid を取ってからヒアリングで検証 |
| P2-5 | 需要トリアージ上位層 (capacity/pipeline モデル) [要Fable5] | intent ranking は実装済み。上位層は first customer の運用フィードバック後に設計 |

---

## 4. 製品の現実を正確に表す記述 (cadence/LP 用)

CC と Codex が合意した「現製品で言えること/言えないこと」:

**言える (repo確認済):**
- 「30秒で3案+ポータル」
- 「バイヤーがいつ開封したか・どの案を気に入ったか・プレクオルをクリックしたかを通知」
- 「HOT/WARM/COLD の buy-intent で今週フォローすべき案件を自動ランク付け」
- 「金利が下がったら自動で追客メール下書き」

**言えない (aspirational / 未実装):**
- 「人を増やさず需要をさばく = capacity vs demand の自動最適化」
- 「トリアージエンジンが次に建てるべき案件を選ぶ」
- 「MLS連携はリアルタイム e2e 実証済み」(実装あり・実資格未検証)

---

## 5. 未解決事項

1. **outreach_log の実データ**: 26社/31通の Pattern 分布・State 分布・送信日時。Supabase 側のみで確認可能。Pattern B を何社に送ったか等が仮説精度に直結。

2. **LinkedIn DM の実行状況**: decisions-log に「LinkedIn最優先」とあるが、実際に送ったDMの数・パターン・to whom の記録がどこにあるか不明。

3. **田中フィーの引き出し条件**: ¥10-50万規模の引き出しが何を達成したら正当化されるか、repo に記述なし [off-repo]。

4. **Homestead Built 行動の一次ソース**: 「ポータル複数開封・無返信」は off-repo。どのポータルスラグ・何回・いつ開封したかは link_events で確認可能なはずだが CC/Codex は Supabase を読んでいない。

5. **Codex の repo アクセス範囲**: Codex がどこまでのパスを読んだか不明 (intent-signals / nurture send を見つけた = CC より広い範囲をスキャンした可能性)。

---

## 6. 統合所感 (Shoji への引き渡し)

**CC と Codex で最も重要な認識差は製品実態の評価だった。**  
CC は intent scoring を「未実装」と断じたが、Codex は `intent-signals/route.ts` + Dashboard Buyer Activity の存在を確認。また CC が「未確認」とした nurture send UI も実装済みだった。この2点は go-forward の製品訴求に直接影響する: **現製品は「通知ツール」ではなく「buy-intent ランキング + 追客自動下書き」まで実装している。**

**最重要行動順:**
1. CAN-SPAM 住所 (法的・今すぐ)
2. サーバーファネルログ (診断可能にする)
3. Homestead Built 追客実験 (最温リードで仮説検証)
4. 10-20社 LinkedIn 手動DM + 厳密記録 (ICP/メッセージ仮説の計測)

Apollo / Sales Navigator / sales-dm-draft 本実装 / 価格改訂 / triage engine は、上記4つの結果を見てから判断する。

**このドキュメントを chat-Claude に渡し、go/no-go 枠組み化・次Q戦略統合を行うことを推奨。**
