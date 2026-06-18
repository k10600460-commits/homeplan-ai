# SplanAI Sales Strategy (Source of Truth) — 2026-06-18
Supersedes: 旧 agents/sales.md（旧ICP=年5-80棟・owner-op／LinkedIn=MRR$500後）
Provenance: 田中MTG(2026-06-09)のピボット ＋ go-forward再精査(2026-06-18, CC+Codex)
Status: ACTIVE。CC/Codex はビルド時に本docを参照（旧戦略に対してビルドしない）

## 0. 一行戦略
"Serve both, target one." 製品は小〜中規模 両対応。**能動アウトリーチ＋主メッセージは中規模に絞る**。
小規模は Free/$49/$149 self-serve の受動オンランプで受ける（門前払いしない／能動の槍は向けない）。

## 1. ICP（能動ターゲット）
中規模 custom / semi-custom ビルダー（~100人規模・年間数十棟〜）。
条件＝予算がある・営業チームが既にいる・労働コスト痛が深い・LinkedInで役職者に届く（"払う＆届く"）。
地理＝新築が活発なサンベルト＋注文比率が濃い地域（New England／中西部／東南中部 ~Nashville）。
受動枠＝年5-25棟/<10人の小規模は Free/$49 で自走サインアップ可。

## 2. Wedge / ポジショニング（見出し）
労働力不足＝"建てる側"の制約。需要は強いが建築キャパが頭打ち（"建てたい300 : 建てる100"）。人は増やせない。
→ 刺さるのは「もっと売れる」じゃなく **「人を増やさず、今ある需要をさばく」**。
3本柱: ①需要をトリアージ（本気の買い手を優先） ②1人あたり生産性UP（経験浅い担当でも即プロ級提案）
        ③長い順番待ちを冷まさない（期待値を最初に揃える）
NG: 「もっと受注を」（建築キャパ頭打ち相手に逆効果）

## 3. ペルソナ
主＝営業リーダー（VP/Director/Manager of Sales）or オーナー/プリンシパル（この規模はオーナーが営業に近い）。
副＝マーケ責任者（buyer-ready提案＋ポータルの角度）。"効率化を買う"のは営業リーダー。

## 4. バリュープロップ（製品→中規模ペインの写像）
- 即 buyer-ready 提案（30秒・ブランドPDF＋ポータル）→ 速く決まる／junior でも回る／drafter・レンダ待ち不要
- 買い手 intent scoring（HOT/WARM/COLD＋Buyer Activity・shipped）→ 300件をトリアージ、ホット優先、tire-kicker に時間を割かない
- 追客自動化（nurture 下書き→送信・shipped）→ 長い waitlist を手間なく warm 維持
正直さ: AI間取りは設計士の代替でなく"営業の入口"。ビルダーが調整＋MLSで実データ反映。

## 5. 価格ポスチャ（billing は作り直さない）
- Free / $49 Pro / $149 Team ＝ self-serve on-ramp（小規模＋中規模の trial 入口）
- **中規模アンカー＝ sales-led "Custom"**（席/拠点ベース・価値価格）。cold で数字は出さない＝デモ/会話で willingness-to-pay を見る
- $149 Team＝中規模が試す現実的入口、Custom＝複数席/拠点。価格シグナルは E-1 で収集

## 6. チャネル & モーション
- チャネル＝**LinkedIn主体（今すぐ）**・実名/顔出し。旧"MRR$500後"は撤回。メールは副（検証済みアドレスのみ）
- モーション＝**デモ/会話主導**（cold self-serve サインアップ狙いではない）
- Hook＝**実区画1件のサンプル提案を先出し**（30秒生成で安く量産・"語らず見せる"／元GTMの"サンプル先出し"と一致）
- 有料ツール（Apollo/Sales Nav）は今は無し。E-2 で discovery volume がボトルネックと実証後に購入判断

## 7. Cadence（E-1: 10-20社・手動・全計測・自動化しない）
T1 LinkedIn コネクト申請（パーソナライズ・ピッチ無し）※既接続/InMail なら T2 から
T2 wedge メッセージ＋サンプル提案オファー
T3 サンプル提案を納品（ブランド入り・相手の実区画）→「これが御社の buyer に見える画面」
T4 ソフトフォロー → 15分デモ予約
メールは同内容をミラー（検証済みアドレスのみ）
例（cold DM・英語・**送信前に HUMANIZE 必須**）:
> "Hi [Name] — quick one. [Builder] sells to-be-built homes, and demand's outrunning what anyone
> can build right now. I made a tool that turns a lot address into a buyer-ready proposal — 3 concepts,
> live financing, a branded buyer portal — in ~30 seconds, and flags which buyers are actually hot so
> your team works the right ones first. Want me to run a free sample on one of your active lots and
> send it over? No call — just so you can see what your buyer would get."

## 8. アウトリーチ規則
- 公開/検証済みアドレスのみ。個人メール推測禁止
- パイプライン監査時は Gmail `in:scheduled` を必ず確認
- nurture/follow-up 送信は CAN-SPAM 物理住所(P0-1)が入るまで停止
- 1社1ペルソナ／同一文面の連投禁止（バリアントは記録して使い分け）

## 9. 計測（instrument-before-diagnose）
アウトリーチ単位: account / role / list / channel / touch# / message-variant / sent_at /
                  delivered(inbox vs spam if detectable) / opened / replied(Y/N+sentiment) /
                  sample_sent / demo_booked
製品ファネル(サーバー側・P0-2): signup / trial_started / checkout_started / checkout_success /
                  share_link_created / portal_lead_created / nurture_sent
判定: n=31 無計測では channel vs offer を断定不可。E-1 の計測結果で初めて診断

## 10. 現フェーズ / 後回し
NOW: P0-1(CAN-SPAM住所)・P0-2(サーバーfunnelログ)・本doc着地 → E-1(10-20社 instrumented)
DEFER: Apollo/Sales Nav有料(E-2でvolume実証後)／リッチtriage・需要-キャパエンジン[要Fable5](初active lead後)／
       MLS e2e(実ビルダー認証=顧客獲得が前提)／testimonials(顧客が出るまで)
NOTE: plan_generations INSERT は best-effort telemetry＝KPI数値は保証会計でない
