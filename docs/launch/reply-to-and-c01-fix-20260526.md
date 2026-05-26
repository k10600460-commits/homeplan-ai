# reply-to 設定 / C-01 確認 — 実施レポート

**実施日**: 2026-05-26  
**commit**: 以下参照

---

## 作業1: 全自動メールに reply-to 追加

### 変更ファイル: `src/lib/emails.ts`

**追加した定数** (line 5):
```ts
const REPLY_TO = "hello@splanai.com";
```

**変更箇所**: 全5メール関数の `resend.emails.send()` に `replyTo: REPLY_TO` を追加

| 関数 | 対象イベント |
|------|------------|
| `sendWelcomeEmail` | サインアップ完了直後 |
| `sendTrialReminderEmail` | トライアル終了3日前 cron |
| `sendFirstPlanFollowupEmail` | 初回プラン生成後 |
| `sendCancellationEmail` | Stripe webhook: cancel_at_period_end |
| `sendTeamInviteEmail` | Team オーナーによる招待 |

**FROM は変更なし**: `SplanAI <noreply@splanai.com>`  
**効果**: ユーザーが返信すると `hello@splanai.com` に届く（転送設定が有効であること前提）

---

## 作業2: C-01 Free ユーザーへの価格表示確認

**結論: 修正不要**

### 確認箇所

`src/app/dashboard/page.tsx:28-29`:
```ts
const isActive =
  subscription?.status === "active" || subscription?.status === "trialing";
```

`src/app/dashboard/DashboardClient.tsx:373-377`:
```tsx
{subscription?.isActive && (
  <span className="text-sm text-gray-500">
    {subscription.plan === "team" ? "$149/month" : "$49/month"}
  </span>
)}
```

### Free ユーザーのケース

| ケース | isActive の値 | 価格 span |
|--------|-------------|----------|
| サブスクなし（subscription = null） | undefined（falsy） | 非表示 ✅ |
| 解約済み（status = "canceled"） | false | 非表示 ✅ |
| status = "active" または "trialing" のみ | true | 表示される（Pro/Team のみ） ✅ |

**Free ユーザーに "$49/month" が表示される経路は存在しない。3分岐への変更は不要。**
