# Analytics & Tracking 現状調査

**Question:** SplanAI の計測・トラッキングの現状を調査（変更しない）:
1. LP/アプリに Web アナリティクスが入っているか
2. メール送信（Resend）の現状: 呼び出し箇所・open/click トラッキング・営業メールの経路
3. ポータル開封計測（link_events）を daily-brief cron が拾う口があるか
4. ファネル可視化のための最小構成提案

---

## Answer

### 1. Web アナリティクス

**Vercel Analytics のみ実装済み。** 他のサービス（GA4, Plausible, PostHog, Mixpanel 等）はなし。

- `<Analytics />` コンポーネントが `src/app/layout.tsx:42` で全ページに適用されている。
- パッケージ: `@vercel/analytics ^2.0.1`（`package.json:18`）
- **LP とアプリ（ダッシュボード・ポータル含む）両方がカバーされる**（root layout に配置されているため）。
- Vercel Analytics はクッキーなし、プライバシーポリシーにも「cookieless」として記載済み（`privacy/page.tsx:211`）。
- **カスタムイベント（ボタンクリック・フォーム送信等）は未実装**。ページビューのみ。

Speed Insights (`@vercel/speed-insights`) は `package.json` に含まれていない。

---

### 2. Resend メール送信 — 呼び出し箇所と設定

#### 呼び出し箇所（全 4 箇所）

| ファイル | 関数 / 用途 | 宛先 |
|---|---|---|
| `src/lib/emails.ts` | `sendWelcomeEmail()` — サインアップ時 | ユーザー |
| `src/lib/emails.ts` | `sendTrialReminderEmail()` — トライアル終了3日前 | ユーザー |
| `src/lib/emails.ts` | `sendFirstPlanFollowupEmail()` — 初回生成後フォロー | ユーザー |
| `src/lib/emails.ts` | `sendCancellationEmail()` — キャンセル時 | ユーザー |
| `src/lib/emails.ts` | `sendTeamInviteEmail()` — チーム招待 | 招待ユーザー |
| `src/lib/external-apis.ts:32` | `sendLimitAlert()` — API使用量警告 | Shoji (管理者) |
| `src/app/api/cron/daily-brief/route.ts:375` | `resend.emails.send()` — 日次ダイジェスト | Shoji (管理者) |

#### open/click トラッキング

**未設定。** 全 Resend 呼び出しで `resend.emails.send()` に渡すオブジェクトに `tags`・`open_tracking`・`click_tracking` フィールドが存在しない（`lib/emails.ts` 全行確認済み）。Resend のデフォルト動作はアカウント設定次第だが、コードから明示的な有効化は確認できない。

#### アウトバウンド営業メール

**Gmail 手動送信**（コード上に営業メール送信の実装なし）。`agents/sales.md` に DM 文案はあるが、それを送る自動化はない。したがって営業メールの開封計測は **別途必要**。

---

### 3. link_events を daily-brief が拾うか

**No。** `src/app/api/cron/daily-brief/route.ts` を全行確認したが、`link_events` も `shared_links` も `view_count` も一切参照していない。

ポータル開封計測（`link_events` INSERT → Realtime）は実装済みだが、用途は：
- `DashboardClient.tsx:283-295`: ダッシュボードのリアルタイム通知（ユーザーがポータルを開いた瞬間にビルダーへ通知）
- `shared_links.view_count`: ダッシュボード上での累計表示

日次ダイジェストにはポータル開封統計が含まれない。daily-brief は KPI（MRR/サブスク数）と Gmail inbox だけ読む。

---

### 4. ファネル可視化のための最小構成提案

現状のファネル計測カバレッジ:

| ファネルステップ | 現状 | ギャップ |
|---|---|---|
| ① LP訪問 | ✅ Vercel Analytics（ページビュー） | カスタムイベントなし（CTAクリック等） |
| ② メール開封（Resend送信分） | ❌ 未計測 | Resend open tracking が無効 |
| ③ ポータル開封（link_events） | ✅ 実装済み（Realtime + view_count） | daily-brief への集計なし |
| ④ サインアップ | 部分的（Vercel Analytics でページビューは取れる） | サインアップ完了の conversion event なし |
| 営業メール開封 | ❌ 未計測 | Gmail 手動送信のため別途必要 |

#### 推奨最小構成（コード変更量の少ない順）

**Step 1 — Resend open tracking を有効化**（1行変更、最小コスト）

各 `resend.emails.send()` 呼び出しに以下を追加:
```ts
headers: { "X-Entity-Ref-ID": to }, // 重複排除用
```
または Resend Dashboard → Email settings → Open/Click tracking を ON にする（コード変更不要）。
ただし Resend の open tracking は HTML メールに 1px pixel を埋め込む方式。

**Step 2 — daily-brief に link_events 集計を追加**（中規模、既存 cron の拡張）

daily-brief cron の KPI ブロックに以下を追加:
```sql
SELECT COUNT(*) FROM link_events WHERE created_at >= now() - interval '24h' AND event_type = 'view'
```
ダイジェストに「昨日のポータル開封数：N件」として表示。

**Step 3 — Vercel Analytics custom events でコンバージョン計測**（小規模）

`@vercel/analytics` の `track()` を使い:
- `track("cta_click", { plan: "free" })` — LP の CTA ボタン
- `track("signup_complete")` — 認証コールバック後
- `track("plan_generated")` — 生成完了後

この 3 点があれば「LP訪問 → CTA クリック → サインアップ → 生成」のファネルが Vercel Dashboard で可視化できる。

#### 営業メール開封計測について

Gmail 手動送信なので Resend では計測できない。選択肢:
- **Streak / Mixmax / Yesware** などの Gmail 拡張で開封計測（最短導入）
- Gmail の scheduled send + BCC自社アドレス で簡易記録
- 本格的な序列は HubSpot CRM の無料プランでも可能

---

## Evidence

| 主張 | ソース |
|---|---|
| Vercel Analytics が全ページに適用 | `src/app/layout.tsx:3,42` |
| `@vercel/analytics ^2.0.1` | `package.json:18` |
| GA4/Plausible/PostHog は存在しない | grep 全ソース確認済み |
| Resend 呼び出し 7 箇所（open tracking なし） | `lib/emails.ts` 全行, `external-apis.ts:32`, `daily-brief/route.ts:375` |
| daily-brief が link_events を読まない | `daily-brief/route.ts` 全行確認 — 該当クエリなし |
| link_events の Realtime 実装 | `DashboardClient.tsx:283-295` |
| view_count が shared_links に存在 | `s/[slug]/page.tsx:24`, `DashboardClient.tsx:25` |

---

## Assumptions & gaps

- Resend アカウントの Dashboard 設定（open tracking のデフォルト ON/OFF）はコードから確認不可。
- Vercel Analytics の actual page view counts と funnel data は Vercel Dashboard を直接確認する必要あり（コードからは参照不可）。
- 営業メールが実際に Gmail から手動送信されているかは git 履歴・agents/sales.md 参照のみで確認 — コード上の自動送信実装は存在しない。

---

## Implications

- **すぐできる最高コスパ改善**: Resend Dashboard で open tracking を ON にするだけ（コード変更ゼロ）でトランザクションメールの開封率が取れる。
- **daily-brief の強化**: link_events 集計を cron に追加すれば「昨日ポータルを開いたクライアント N 人」が毎朝ダイジェストに入り、営業フォローのトリガーになる。
- **Vercel Analytics の track()**: LP → サインアップ → 生成のコンバージョンを最小コードで可視化可能。Plausible に切り替える必要はない（Vercel Analytics で十分）。
