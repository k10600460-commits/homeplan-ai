# SplanAI プラン差別化マトリクス

**実施日**: 2026-05-24  
**調査範囲**: `src/` 全体（API routes / dashboard / results / lib）  
**方針**: 調査・記録のみ。コード変更なし。

---

## 差別化マトリクス（コードベース実態）

| 機能 / 上限 | Free | Pro | Team | gate の根拠 |
|-------------|------|-----|------|------------|
| **価格** | $0 | $49/月 | $149/月 | Stripe price ID |
| **無料トライアル** | なし | 14日 | 14日 | `TRIAL_PERIOD_DAYS` |
| **間取り生成（月上限）** | **3回** | **100回** | **100回** | `usage.ts:10-12` |
| **PDF ブランディング** | SplanAI ロゴ固定 | 自社ロゴ + SplanAI 名残 | **White-label**（SplanAI ロゴ完全除去） | `results/page.tsx:513-514` |
| **近隣データ（Google Maps）** | ✅（制限なし） | ✅ | ✅ | plan gate なし `neighborhood/route.ts:113` |
| **市場データ（RentCast）** | ✅（制限なし） | ✅ | ✅ | plan gate なし |
| **顧客共有リンク作成** | ✅（制限なし） | ✅ | ✅ | plan gate なし `share/create/route.ts:22-23` |
| **リアルタイム閲覧通知** | ✅（制限なし） | ✅ | ✅ | plan gate なし `DashboardClient.tsx:251` |
| **共有リンク view_count 表示** | ✅ | ✅ | ✅ | plan gate なし |
| **MLS 連携（Trestle）** | ❌ | ✅ | ✅ | `isPro` チェック `mls/lot-data/route.ts:88`, `mls/connect/route.ts:44` |
| **チーム管理パネル** | ❌ | ❌ | ✅ | `userPlan === "team"` `DashboardClient.tsx:639` |
| **メンバー招待** | ❌ | ❌ | ✅（最大 14 名 + owner = 15） | `plan !== "team"` → 403 `team/invite/route.ts:21` |
| **会社名 White-label 設定** | ❌ | ❌ | ✅ | Team panel 内 `DashboardClient.tsx:651` |
| **Team → Pro アップセル非表示** | ❌ | ✅（表示） | ❌ | `userPlan === "pro"` `DashboardClient.tsx:749` |

---

## 各ゲートの実装詳細

### 1. 間取り生成上限（Free / Pro / Team 共通ロジック）

**`src/lib/usage.ts:9-13`**

```ts
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3 },
  pro:  { requestsPerMonth: 100 },
  team: { requestsPerMonth: 100 },
}
```

**`src/app/api/generate/route.ts:84-94`** — 上限超過時 HTTP 429 → `/upgrade` リダイレクト。Claude API には未到達。

---

### 2. PDF ブランディング（Pro vs Team の最大差別化）

**`src/app/results/page.tsx:510-515`**

```ts
fetch("/api/team/plan")
  .then((d: { plan: string; companyName: string }) => {
    if (d.plan === "team") {
      setWhiteLabelOptions({ enabled: true, companyName: d.companyName });
    }
  })
```

**`src/app/results/page.tsx:207,254,455`**

```ts
// buildPDF()
const whiteLabel = whiteLabelOptions?.enabled ?? false;
// ...
doc.text(whiteLabel ? companyLabel : "SplanAI", ML, HEADER_H / 2 + 2);
// ...
if (whiteLabel) { /* フッターも白ラベル */ }
```

| プラン | PDF ヘッダー | PDF フッター | ファイル名 |
|--------|------------|------------|---------|
| Free | "SplanAI" 固定 | SplanAI ブランド | `SplanAI-Floor-Plans.pdf` |
| Pro | 自社ロゴ画像 + "SplanAI" テキスト | SplanAI ブランド | `SplanAI-Floor-Plans.pdf` |
| Team | 自社ロゴ画像 + **会社名**（"SplanAI" 非表示） | **White-label** | **`{会社名}-Floor-Plans.pdf`** |

---

### 3. MLS 連携（Free のみブロック / Pro + Team は同等）

**`src/app/api/mls/lot-data/route.ts:87-92`**

```ts
const plan = await getUserPlan(user.id);
if (plan === "free") {
  return NextResponse.json(
    { error: "MLS integration requires Pro or Team plan.", upgradeUrl: "/pricing" },
    { status: 403 },
  );
}
```

**`src/app/dashboard/DashboardClient.tsx:97`**

```ts
const isPro = subscription?.isActive ?? false;
// isActive = status が 'active' または 'trialing'
// → Pro も Team も isActive: true → isPro = true
```

`isPro` は「Pro 以上（Pro OR Team）」を意味する変数名。実装上 Pro と Team に差はない。

---

### 4. チーム機能（Team 専用）

**`src/app/api/team/invite/route.ts:19-25`**

```ts
const MAX_MEMBERS = 15;   // オーナー含む合計上限
// ...
if (plan !== "team") {
  return NextResponse.json({ error: "Team plan required to invite members." }, { status: 403 });
}
if ((count ?? 0) >= MAX_MEMBERS - 1) {
  return NextResponse.json({ error: `Team limit reached (max ${MAX_MEMBERS} including owner)` }, { status: 400 });
}
```

**`src/app/dashboard/DashboardClient.tsx:639`**

```tsx
{userPlan === "team" && (
  <div>  {/* Team Management パネル — メンバー一覧・招待・会社名設定 */}
```

---

### 5. プランゲートのない機能（LP 表記との乖離）

以下の機能は LP・Terms で「Pro 機能」として記載されているが、コード上はプランチェックなし:

| 機能 | LP 記載 | 実際のコード | 乖離 |
|------|---------|------------|------|
| Neighborhood & market data | Pro のみ | plan gate なし（Free 含む全員） | ⚠️ |
| Client sharing portal | Pro のみ | plan gate なし（Free 含む全員） | ⚠️ |
| リアルタイム閲覧通知 | Pro のみ（追跡機能として） | plan gate なし | ⚠️ |

---

## Pro と Team を実際に分けている要素

### コードで実装されている差別化

| 要素 | Pro | Team | gate の箇所 |
|------|-----|------|------------|
| 月額 | $49 | $149 | Stripe price ID 分岐 `checkout/route.ts:28` |
| PDF White-label | ❌（SplanAI 名残） | ✅（SplanAI ロゴ・名前ゼロ） | `results/page.tsx:513` |
| 会社名 PDF 表示 | ❌ | ✅ | `results/page.tsx:254` |
| チーム管理パネル | ❌ | ✅ | `DashboardClient.tsx:639` |
| メンバー招待（最大15） | ❌ | ✅ | `team/invite/route.ts:21` |
| Team → Pro アップセル表示 | ✅ | ❌ | `DashboardClient.tsx:749` |

### 差別化されていないもの（Pro = Team）

| 要素 | 備考 |
|------|------|
| 間取り生成上限（100回/月/ユーザー） | `PLAN_LIMITS` で同値 |
| MLS 連携（Trestle） | `isPro` で両方 pass |
| 近隣データ・市場データ | plan gate なし |
| 顧客共有リンク・追跡 | plan gate なし |
| AI モデル（claude-sonnet-4-6） | 固定 |
| 無料トライアル期間（14日） | 固定 |

**Pro と Team を分けているのは実質「White-label PDF + チーム管理（メンバー招待・最大15人）」の2点のみ。** 生成回数・MLS・近隣データは同等。

---

## `isPro` フラグの定義と注意点

**`src/app/dashboard/DashboardClient.tsx:97`**

```ts
const isPro = subscription?.isActive ?? false;
// isActive: subscription.status が 'active' または 'trialing'
```

- `isPro === true` の条件: Pro サブスク OR Team サブスク（両方 isActive: true）
- 変数名は `isPro` だが **「Pro 以上（Pro OR Team）」** を表す
- MLS ゲートは `isPro` 判定のため Pro・Team どちらでも使用可能

---

## 参照

- `src/lib/usage.ts:9-12` — `PLAN_LIMITS` 定義
- `src/app/api/generate/route.ts:84-94` — 生成上限チェック
- `src/app/results/page.tsx:510-515, 207, 254, 455` — PDF ブランディング切り替え
- `src/app/api/mls/lot-data/route.ts:87-92` — MLS プランゲート
- `src/app/api/mls/connect/route.ts:43-47` — MLS connect プランゲート
- `src/app/api/team/invite/route.ts:12,19-25` — MAX_MEMBERS / Team 専用ゲート
- `src/app/dashboard/DashboardClient.tsx:97, 639, 727, 749` — isPro / userPlan 分岐
- `src/app/api/share/create/route.ts:22-23` — 共有リンク: plan gate なし
- `docs/launch/plan-usage-limits-audit-20260524.md` — 生成上限詳細
- `docs/launch/api-cost-surface-audit-20260524.md` — API コスト全体像
